import openAIService from '../services/openAIService.js';
import { Response, Error } from '../utils/helpers.js';
import logger from '../utils/logger.js';

class AiAssistantController {
  
  async generateMissionDescription(req, res) {
    try {
      const { title, category, key_points, tone = 'professional' } = req.body;
      const userId = req.user.id;

      logger.info('Génération description mission IA', { userId, title, category });

      if (!title || !category) {
        return res.status(400).json(Response.error('Titre et catégorie requis'));
      }

      const prompt = this.createMissionDescriptionPrompt(title, category, key_points, tone);
      const result = await openAIService.generateContent(prompt);

      if (!result.success) {
        return res.status(400).json(result);
      }

      logger.info('Description mission générée avec succès', { userId, title });

      res.json(Response.success({
        description: result.data,
        original_prompt: { title, category, key_points, tone }
      }, 'Description générée avec succès'));

    } catch (error) {
      logger.error('Erreur génération description mission IA', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la génération de la description'));
    }
  }

  async optimizeProposal(req, res) {
    try {
      const { mission_description, original_proposal, bid_amount, delivery_days } = req.body;
      const userId = req.user.id;

      logger.info('Optimisation proposition IA', { userId, bid_amount, delivery_days });

      if (!mission_description || !original_proposal) {
        return res.status(400).json(Response.error('Description mission et proposition originale requises'));
      }

      const prompt = this.createProposalOptimizationPrompt(
        mission_description, 
        original_proposal, 
        bid_amount, 
        delivery_days
      );

      const result = await openAIService.generateContent(prompt);

      if (!result.success) {
        return res.status(400).json(result);
      }

      logger.info('Proposition optimisée avec succès', { userId });

      res.json(Response.success({
        optimized_proposal: result.data,
        original_proposal,
        improvements: this.extractImprovements(result.data, original_proposal)
      }, 'Proposition optimisée avec succès'));

    } catch (error) {
      logger.error('Erreur optimisation proposition IA', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de l\'optimisation de la proposition'));
    }
  }

  async generateTags(req, res) {
    try {
      const { title, description, category } = req.body;
      const userId = req.user.id;

      logger.debug('Génération tags IA', { userId, title, category });

      if (!title || !description) {
        return res.status(400).json(Response.error('Titre et description requis'));
      }

      const prompt = this.createTagsGenerationPrompt(title, description, category);
      const result = await openAIService.generateContent(prompt);

      if (!result.success) {
        return res.status(400).json(result);
      }

      const tags = this.parseTagsFromResponse(result.data);

      logger.info('Tags générés avec succès', { userId, tagsCount: tags.length });

      res.json(Response.success({
        tags,
        generated_count: tags.length
      }, 'Tags générés avec succès'));

    } catch (error) {
      logger.error('Erreur génération tags IA', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la génération des tags'));
    }
  }

  async analyzeMission(req, res) {
    try {
      const { title, description, budget, category } = req.body;
      const userId = req.user.id;

      logger.info('Analyse mission IA', { userId, title, budget, category });

      if (!title || !description) {
        return res.status(400).json(Response.error('Titre et description requis'));
      }

      const prompt = this.createMissionAnalysisPrompt(title, description, budget, category);
      const result = await openAIService.generateContent(prompt);

      if (!result.success) {
        return res.status(400).json(result);
      }

      const analysis = this.parseMissionAnalysis(result.data);

      logger.info('Analyse mission terminée', { userId, title });

      res.json(Response.success({
        analysis,
        recommendations: analysis.recommendations || [],
        risk_level: analysis.risk_level || 'medium'
      }, 'Analyse mission terminée'));

    } catch (error) {
      logger.error('Erreur analyse mission IA', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de l\'analyse de la mission'));
    }
  }

  // Méthodes helper pour la création des prompts
  createMissionDescriptionPrompt(title, category, key_points, tone) {
    return `
En tant qu'expert en rédaction de descriptions de missions freelance, génère une description engageante et professionnelle pour la mission suivante :

TITRE: ${title}
CATÉGORIE: ${category}
${key_points ? `POINTS CLÉS: ${key_points}` : ''}
TON: ${tone}

La description doit :
- Être persuasive et professionnelle
- Attirer des freelancers qualifiés
- Clarifier les attentes et livrables
- Inclure des détails concrets
- Être bien structurée avec des paragraphes courts

Génère uniquement la description sans commentaires supplémentaires.
    `.trim();
  }

  createProposalOptimizationPrompt(mission_description, original_proposal, bid_amount, delivery_days) {
    return `
En tant qu'expert en rédaction de propositions freelance, optimise cette proposition pour maximiser les chances d'acceptation :

DESCRIPTION DE LA MISSION:
${mission_description}

PROPOSITION ORIGINALE:
${original_proposal}

${bid_amount ? `BUDGET PROPOSÉ: ${bid_amount} FCFA` : ''}
${delivery_days ? `DÉLAI PROPOSÉ: ${delivery_days} jours` : ''}

Améliore cette proposition en :
1. Mieux alignant avec la description de la mission
2. Mettant en valeur l'expertise et l'approche
3. Clarifiant la valeur apportée
4. Utilisant un ton professionnel et confiant
5. Structurant de manière claire et persuasive

Génère uniquement la proposition optimisée sans commentaires.
    `.trim();
  }

  createTagsGenerationPrompt(title, description, category) {
    return `
Génère 5 à 10 tags pertinents pour cette mission freelance :

TITRE: ${title}
DESCRIPTION: ${description}
${category ? `CATÉGORIE: ${category}` : ''}

Les tags doivent :
- Être pertinents pour le contenu
- Inclure des compétences techniques si applicables
- Être populaires dans les recherches
- Être en français ou anglais technique
- Varier entre général et spécifique

Retourne uniquement les tags séparés par des virgules, sans numérotation ni commentaires.
    `.trim();
  }

  createMissionAnalysisPrompt(title, description, budget, category) {
    return `
Analyse cette mission freelance et fournis une évaluation détaillée :

TITRE: ${title}
DESCRIPTION: ${description}
${budget ? `BUDGET: ${budget} FCFA` : ''}
${category ? `CATÉGORIE: ${category}` : ''}

Fournis une analyse structurée incluant :
1. Difficulté estimée (facile/moyenne/difficile)
2. Compétences requises
3. Délai réaliste
4. Budget adéquat (si fourni, évalue son adéquation)
5. Risques potentiels
6. Recommandations pour le client
7. Conseils pour les freelancers

Formatte la réponse en JSON structuré.
    `.trim();
  }

  // Méthodes helper pour le parsing des réponses
  parseTagsFromResponse(response) {
    try {
      // Nettoyer la réponse et extraire les tags
      const cleaned = response.replace(/[\[\]]/g, '').replace(/\d+\./g, '');
      const tags = cleaned.split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0 && tag.length < 50)
        .slice(0, 10);
      
      return tags;
    } catch (error) {
      logger.error('Erreur parsing tags IA', { error: error.message, response });
      return [];
    }
  }

  parseMissionAnalysis(response) {
    try {
      // Essayer de parser comme JSON d'abord
      if (response.trim().startsWith('{')) {
        return JSON.parse(response);
      }

      // Fallback: extraction manuelle
      const analysis = {
        difficulty: this.extractValue(response, 'difficulté', 'Difficulté'),
        required_skills: this.extractList(response, 'compétences', 'Compétences'),
        realistic_timeline: this.extractValue(response, 'délai', 'Délai'),
        budget_adequacy: this.extractValue(response, 'budget', 'Budget'),
        risks: this.extractList(response, 'risques', 'Risques'),
        recommendations: this.extractList(response, 'recommandations', 'Recommandations')
      };

      return analysis;
    } catch (error) {
      logger.error('Erreur parsing analyse mission', { error: error.message, response });
      return { error: 'Erreur de parsing de l\'analyse' };
    }
  }

  extractValue(text, ...keywords) {
    for (const keyword of keywords) {
      const regex = new RegExp(`${keyword}[\\s:]+([^\\n.,]+)`, 'i');
      const match = text.match(regex);
      if (match) return match[1].trim();
    }
    return null;
  }

  extractList(text, ...keywords) {
    for (const keyword of keywords) {
      const regex = new RegExp(`${keyword}[\\s:]+([^]*?)(?=\\n\\n|\\n[A-Z]|$)`, 'i');
      const match = text.match(regex);
      if (match) {
        return match[1].split('\n')
          .map(item => item.replace(/^[•\-*\d.]+\s*/, '').trim())
          .filter(item => item.length > 0);
      }
    }
    return [];
  }

  extractImprovements(optimized, original) {
    // Analyse simple des différences
    const improvements = [];
    
    if (optimized.length > original.length * 1.2) {
      improvements.push('Description plus détaillée');
    }
    
    if (optimized.includes('expert') || optimized.includes('expérience')) {
      improvements.push('Mise en valeur de l\'expertise');
    }
    
    if (optimized.includes('valeur') || optimized.includes('bénéfice')) {
      improvements.push('Meilleure articulation de la valeur');
    }
    
    return improvements;
  }
}

export default new AiAssistantController();