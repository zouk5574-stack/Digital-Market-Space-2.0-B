// src/services/openAIService.js
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const openAIService = {
  async sendMessage({ message, systemPrompt, conversationHistory, userContext }) {
    try {
      // Préparer les messages pour l'API OpenAI
      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.map(msg => ({
          role: msg.user_message ? "user" : "assistant",
          content: msg.user_message || msg.ai_response
        })),
        { role: "user", content: message }
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // ou "gpt-4" pour plus de précision
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
        user: userContext.userId // Pour le tracking OpenAI
      });

      const response = completion.choices[0].message;
      
      return {
        content: response.content,
        usage: completion.usage
      };

    } catch (error) {
      console.error("OpenAI API error:", error);
      
      // Fallback si l'API OpenAI échoue
      if (error.code === 'insufficient_quota' || error.code === 'billing_not_active') {
        throw new Error("Service IA temporairement indisponible");
      }
      
      throw new Error("Erreur de communication avec l'assistant IA");
    }
  },

  // Génération de contenu spécifique
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
      
      Le brief doit être précis, professionnel et attractif pour les talents.`
    };

    const prompt = prompts[type];
    if (!prompt) {
      throw new Error("Type de contenu non supporté");
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Tu es un expert en rédaction pour plateforme digitale." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.8
    });

    return completion.choices[0].message.content;
  }
};
