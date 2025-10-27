import OpenAI from 'openai';
import { supabase } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

// Initialisation OpenAI avec gestion d'erreur
let openai;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30000,
    maxRetries: 3
  });
} catch (error) {
  console.error('Erreur initialisation OpenAI:', error);
}

export class OpenAIService {
  constructor() {
    this.openai = openai;
  }

  // Génération de réponse IA avec contexte
  async generateAIResponse(messages, userId, context = {}) {
    if (!this.openai) {
      throw new AppError('Service IA non disponible', 503);
    }

    try {
      // Préparation du contexte système
      const systemMessage = {
        role: 'system',
        content: `Vous êtes un assistant IA pour Digital Market Space, une plateforme de freelance.
        
Contexte utilisateur:
- ID: ${userId}
- Rôle: ${context.userRole || 'utilisateur'}
- Expérience: ${context.completedMissions || 0} missions complétées

Règles:
1. Répondez de manière professionnelle et utile
2. Soyez concis mais complet
3. Ne donnez pas de conseils financiers ou juridiques
4. Respectez les guidelines de la plateforme
5. Aidez avec les missions, commandes, paiements et retraits

Limites:
- Ne générez pas de code malveillant
- Ne partagez pas d'informations sensibles
- Respectez la confidentialité des données`
      };

      const conversation = [systemMessage, ...messages];

      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: conversation,
        max_tokens: 1000,
        temperature: 0.7,
        user: userId // Pour le tracking OpenAI
      });

      const response = completion.choices[0]?.message?.content;
      
      if (!response) {
        throw new AppError('Aucune réponse générée par l\'IA', 500);
      }

      // Log de l'interaction
      await this.logInteraction(userId, messages, response, context);

      return response;
    } catch (error) {
      log.error('Erreur service OpenAI:', error);
      
      if (error.code === 'insufficient_quota') {
        throw new AppError('Service IA temporairement indisponible', 503);
      }
      
      if (error.code === 'rate_limit_exceeded') {
        throw new AppError('Limite de requêtes IA atteinte', 429);
      }
      
      throw new AppError('Erreur du service IA', 500);
    }
  }

  // Log des interactions IA
  async logInteraction(userId, inputMessages, output, context = {}) {
    try {
      await supabase
        .from('ai_interactions')
        .insert({
          user_id: userId,
          input_messages: inputMessages,
          output_message: output,
          model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
          token_count: output.length / 4, // Estimation
          context: context,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Erreur log interaction IA:', error);
    }
  }

  // Analyse de mission avec IA
  async analyzeMission(missionData, userId) {
    const prompt = `Analysez cette mission freelance et donnez des recommandations:

Titre: ${missionData.title}
Description: ${missionData.description}
Budget: ${missionData.budget}
Catégorie: ${missionData.category}
Deadline: ${missionData.deadline}

Recommandations demandées:
1. Évaluation de la difficulté
2. Conseils pour le budget
3. Compétences requises
4. Timeline recommandée

Répondez en format JSON structuré.`;

    const messages = [
      {
        role: 'user',
        content: prompt
      }
    ];

    const response = await this.generateAIResponse(messages, userId, {
      analysisType: 'mission'
    });

    try {
      return JSON.parse(response);
    } catch (error) {
      return { analysis: response };
    }
  }

  // Génération de description optimisée
  async optimizeDescription(originalDescription, missionContext, userId) {
    const prompt = `Optimisez cette description de mission freelance:

Description originale: "${originalDescription}"

Contexte:
- Catégorie: ${missionContext.category}
- Budget: ${missionContext.budget}
- Public cible: Freelancers professionnels

Améliorations demandées:
1. Rendre plus engageant
2. Clarifier les exigences
3. Mettre en valeur les bénéfices
4. Structurer avec des points clés

Retournez uniquement la description optimisée.`;

    const messages = [
      {
        role: 'user',
        content: prompt
      }
    ];

    return await this.generateAIResponse(messages, userId, {
      optimizationType: 'description'
    });
  }
}

export const openAIService = new OpenAIService();