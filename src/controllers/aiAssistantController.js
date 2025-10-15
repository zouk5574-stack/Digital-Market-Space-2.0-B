// src/controllers/aiAssistantController.js
import { supabase } from "../server.js";
import { openAIService } from "../services/openAIService.js";
import { contextService } from "../services/contextService.js";
import { addLog } from "./logController.js";

// Cache des conversations en mémoire (ou Redis en production)
const conversationCache = new Map();

export async function handleAIMessage(req, res) {
  try {
    const user = req.user.db;
    const { message, context = {} } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: "Message vide" });
    }

    // 1. Préparer le contexte utilisateur
    const userContext = await contextService.buildUserContext(user, context);
    
    // 2. Récupérer l'historique de conversation
    const conversationHistory = await getOrCreateConversation(user.id, context.conversationId);
    
    // 3. Construire le prompt contextuel
    const systemPrompt = buildSystemPrompt(userContext);
    
    // 4. Appeler le service OpenAI
    const aiResponse = await openAIService.sendMessage({
      message: message.trim(),
      systemPrompt,
      conversationHistory: conversationHistory.messages.slice(-6), // Derniers 6 messages
      userContext
    });

    // 5. Sauvegarder la conversation
    const updatedConversation = await saveConversationMessage(
      conversationHistory.id,
      user.id,
      message,
      aiResponse.content,
      userContext
    );

    // 6. Logger l'interaction
    await addLog(user.id, 'AI_ASSISTANT_QUERY', {
      conversationId: conversationHistory.id,
      messageLength: message.length,
      responseLength: aiResponse.content.length,
      tokensUsed: aiResponse.usage?.total_tokens
    });

    res.json({
      message: aiResponse.content,
      suggestions: generateQuickSuggestions(userContext, aiResponse.content),
      conversationId: conversationHistory.id,
      usage: aiResponse.usage
    });

  } catch (error) {
    console.error("AI Assistant error:", error);
    
    // Message d'erreur générique pour l'utilisateur
    const errorMessage = "Je rencontre des difficultés techniques. Veuillez réessayer dans quelques instants.";
    
    res.json({
      message: errorMessage,
      suggestions: ["Réessayer", "Contacter le support"],
      isError: true
    });
  }
}

// Récupérer ou créer une conversation
async function getOrCreateConversation(userId, conversationId = null) {
  if (conversationId && conversationCache.has(conversationId)) {
    return conversationCache.get(conversationId);
  }

  if (conversationId) {
    // Récupérer depuis la base de données
    const { data: existingConv } = await supabase
      .from("ai_conversations")
      .select("*, messages(*)")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single();

    if (existingConv) {
      conversationCache.set(conversationId, existingConv);
      return existingConv;
    }
  }

  // Créer une nouvelle conversation
  const { data: newConversation, error } = await supabase
    .from("ai_conversations")
    .insert([{
      user_id: userId,
      title: "Nouvelle conversation",
      context: {}
    }])
    .select()
    .single();

  if (error) throw error;

  const conversation = { ...newConversation, messages: [] };
  conversationCache.set(newConversation.id, conversation);
  
  return conversation;
}

// Sauvegarder un message dans la conversation
async function saveConversationMessage(conversationId, userId, userMessage, aiResponse, context) {
  const { data: message, error } = await supabase
    .from("ai_messages")
    .insert([{
      conversation_id: conversationId,
      user_id: userId,
      user_message: userMessage,
      ai_response: aiResponse,
      context: context,
      tokens_used: 0 // À calculer depuis la réponse OpenAI
    }])
    .select()
    .single();

  if (error) throw error;

  // Mettre à jour le cache
  const conversation = conversationCache.get(conversationId);
  if (conversation) {
    conversation.messages.push(message);
  }

  return message;
}

// Construire le prompt système selon le rôle
function buildSystemPrompt(userContext) {
  const { userRole, userData, platformContext } = userContext;
  
  const roleSpecificInstructions = {
    ADMIN: `Tu es l'assistant IA expert de Digital Market Space pour les administrateurs.
    Tu aides à analyser les performances, générer des rapports et optimiser la plateforme.
    Donne des réponses précises et exploitables.`,

    VENDEUR: `Tu es l'assistant IA expert de Digital Market Space pour les vendeurs.
    Tu aides à créer des descriptions de produits, optimiser les prix, analyser les ventes.
    Sois pratique et orienté résultats.`,

    ACHETEUR: `Tu es l'assistant IA expert de Digital Market Space pour les acheteurs.
    Tu aides à trouver des produits, créer des missions freelance, comprendre les processus.
    Sois utile et pédagogique.`
  };

  const basePrompt = `
# Rôle
${roleSpecificInstructions[userRole] || roleSpecificInstructions.ACHETEUR}

# Règles importantes
- Réponds en français sauf demande contraire
- Sois concis mais complet
- Propose des actions concrètes
- Mentionne les fonctionnalités spécifiques de Digital Market Space
- Ne donne pas d'informations sensibles ou personnelles sur d'autres utilisateurs

# Contexte de l'utilisateur
- Rôle: ${userRole}
- Expérience sur la plateforme: ${userData.joinCount} commandes/ventes
- Statut: ${userData.isActive ? 'Actif' : 'Inactif'}

# Contexte de la plateforme
- Commission: ${platformContext.commissionRate}%
- Limite boutiques: ${platformContext.shopLimit}
- Processus de retrait: ${platformContext.withdrawalProcess}
  `;

  return basePrompt;
}

// Générer des suggestions rapides contextuelles
function generateQuickSuggestions(userContext, lastResponse) {
  const { userRole } = userContext;
  
  const roleSuggestions = {
    ADMIN: [
      "Génère un rapport des performances du mois",
      "Analyse l'évolution des ventes",
      "Identifie les vendeurs les plus actifs",
      "Suggestions d'amélioration de la plateforme"
    ],
    VENDEUR: [
      "Comment optimiser mes descriptions de produits ?",
      "Quelle stratégie de prix recommander ?", 
      "Analyse mes statistiques de vente",
      "Comment augmenter ma visibilité ?"
    ],
    ACHETEUR: [
      "Comment trouver le bon prestataire ?",
      "Explique le processus de création de mission",
      "Quels sont les délais moyens ?",
      "Comment sécuriser mes transactions ?"
    ]
  };

  return roleSuggestions[userRole] || roleSuggestions.ACHETEUR;
}

// Obtenir l'historique des conversations
export async function getConversations(req, res) {
  try {
    const user = req.user.db;
    
    const { data: conversations, error } = await supabase
      .from("ai_conversations")
      .select("id, title, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    res.json({ conversations: conversations || [] });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
  }
