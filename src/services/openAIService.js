// src/services/openAIService.js
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Filtres de contenu selon le rôle
const contentFilters = {
  VENDEUR: (response) => {
    const adminPatterns = [
      /tableau de bord admin/i,
      /statistiques .* (globales|tous)/i,
      /tous les (utilisateurs|vendeurs)/i,
      /système .* (plateforme|admin)/i,
      /paramètres (avancés|système)/i,
      /chiffre d'affaires total/i
    ];
    
    const hasForbiddenContent = adminPatterns.some(pattern => pattern.test(response));
    return !hasForbiddenContent;
  },
  ACHETEUR: (response) => {
    const adminPatterns = [
      /interface admin/i,
      /(vendeurs?|acheteurs?) .* tous/i,
      /chiffre d'affaires .* total/i,
      /paramètres .* (système|avancés)/i,
      /statistiques .* (globales|tous)/i,
      /backoffice/i
    ];
    
    const hasForbiddenContent = adminPatterns.some(pattern => pattern.test(response));
    return !hasForbiddenContent;
  }
};

export const openAIService = {
  async sendMessage({ message, systemPrompt, conversationHistory, userContext }) {
    try {
      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.map(msg => ({
          role: msg.user_message ? "user" : "assistant",
          content: msg.user_message || msg.ai_response
        })),
        { role: "user", content: message }
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: messages,
        max_tokens: 800,
        temperature: 0.7,
        user: userContext.userId
      });

      let response = completion.choices[0].message.content;
      
      // FILTRAGE FINAL DE LA RÉPONSE (sauf pour admin)
      if (userContext.userRole !== 'ADMIN') {
        const filter = contentFilters[userContext.userRole];
        if (filter && !filter(response)) {
          response = "Je ne peux pas fournir ces informations spécifiques. Pour toute question technique, veuillez contacter notre équipe de support.";
        }
      }

      return {
        content: response,
        usage: completion.usage
      };

    } catch (error) {
      console.error("OpenAI API error:", error);
      
      if (error.code === 'insufficient_quota' || error.code === 'billing_not_active') {
        throw new Error("Service IA temporairement indisponible");
      }
      
      throw new Error("Erreur de communication avec l'assistant IA");
    }
  },

  async generateContent(type, parameters, userContext) {
    const prompts = {
      product_description: `Génère une description attrayante pour un produit e-commerce:
      - Produit: ${parameters.productName}
      - Catégorie: ${parameters.category}
      - Caractéristiques: ${parameters.features}
      - Public cible: ${parameters.targetAudience}
      
      La description doit être persuasive, SEO-friendly et mettre en valeur les bénéfices.`,

      mission_brief: `Rédige un brief clair pour une mission freelance:
      - Titre: ${parameters.title}
      - Domaine: ${parameters.domain}
      - Budget: ${parameters.budget}
      - Délai: ${parameters.deadline}
      - Compétences requises: ${parameters.skills}
      
      Le brief doit être précis, professionnel et attractif pour les talents.`,

      shop_description: `Crée une description engageante pour une boutique en ligne:
      - Nom: ${parameters.shopName}
      - Spécialité: ${parameters.specialty}
      - Valeurs: ${parameters.values}
      - Public: ${parameters.targetCustomers}
      
      La description doit refléter l'identité de la boutique.`,

      proposal_template: `Génère un modèle de proposition pour une mission freelance:
      - Type: ${parameters.missionType}
      - Compétences: ${parameters.skills}
      - Expérience: ${parameters.experience}
      
      La proposition doit être professionnelle et persuasive.`
    };

    const prompt = prompts[type];
    if (!prompt) {
      throw new Error("Type de contenu non supporté");
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { 
          role: "system", 
          content: "Tu es un expert en rédaction pour plateforme digitale. Génère du contenu professionnel et engageant." 
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.8
    });

    return completion.choices[0].message.content;
  }
};
