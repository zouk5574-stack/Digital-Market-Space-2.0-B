// src/controllers/aiAssistantController.js
import { supabase } from "../server.js";
import { openAIService } from "../services/openAIService.js";
import { contextService } from "../services/contextService.js";
import { addLog, addSecurityLog } from "./logController.js";

// Cache des conversations en mémoire
const conversationCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

// Nettoyage périodique du cache
setInterval(() => {
  const now = Date.now();
  for (const [id, conversation] of conversationCache.entries()) {
    if (now - conversation.lastAccessed > CACHE_TTL) {
      conversationCache.delete(id);
    }
  }
}, 5 * 60 * 1000);

// VALIDATION D'ACCÈS SÉCURISÉE
function validateUserAccess(userContext, message) {
  const { userRole } = userContext;

  const forbiddenPatterns = {
    VENDEUR: [
      /admin/i, /administrateur/i, /backoffice/i, /tableau de bord admin/i,
      /statistiques globales/i, /tous les utilisateurs/i, /système/i,
      /paramètres avancés/i, /logs? système/i, /rapport complet/i,
      /chiffre d'affaires total/i, /tous les vendeurs/i
    ],
    ACHETEUR: [
      /admin/i, /administrateur/i, /backoffice/i, /vendeurs? .* tous/i,
      /chiffre d'affaires total/i, /commission .* globale/i,
      /paramètres .* plateforme/i, /système/i, /logs?/i,
      /statistiques .* (globales|tous)/i, /interface admin/i
    ]
  };

  const patterns = forbiddenPatterns[userRole] || [];
  const hasForbiddenContent = patterns.some(pattern => pattern.test(message));

  if (hasForbiddenContent) {
    throw new Error("ACCESS_DENIED");
  }

  return true;
}

function getSecurityFallbackSuggestions(userRole) {
  const suggestions = {
    ADMIN: [
      "Génère un rapport des performances",
      "Analyse l'évolution des ventes",
      "Identifie les tendances du marché"
    ],
    VENDEUR: [
      "Comment optimiser mes descriptions ?",
      "Quelle stratégie de prix ?", 
      "Comment augmenter ma visibilité ?"
    ],
    ACHETEUR: [
      "Comment créer une mission ?",
      "Comment trouver un prestataire ?",
      "Comment sécuriser mes transactions ?"
    ]
  };

  return suggestions[userRole] || suggestions.ACHETEUR;
}

// Récupérer ou créer une conversation
async function getOrCreateConversation(userId, conversationId = null) {
  if (conversationId && conversationCache.has(conversationId)) {
    const cached = conversationCache.get(conversationId);
    cached.lastAccessed = Date.now();
    return cached;
  }

  if (conversationId) {
    const { data: existingConv, error } = await supabase
      .from("ai_conversations")
      .select(`
        *,
        ai_messages(
          id,
          user_message,
          ai_response,
          created_at,
          tokens_used
        )
      `)
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single();

    if (!error && existingConv) {
      const conversation = {
        ...existingConv,
        messages: existingConv.ai_messages || [],
        lastAccessed: Date.now()
      };
      conversationCache.set(conversationId, conversation);
      return conversation;
    }
  }

  // Créer une nouvelle conversation
  const initialTitle = `Conversation du ${new Date().toLocaleDateString('fr-FR')}`;

  const { data: newConversation, error } = await supabase
    .from("ai_conversations")
    .insert([{
      user_id: userId,
      title: initialTitle,
      context: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;

  const conversation = { 
    ...newConversation, 
    messages: [],
    lastAccessed: Date.now()
  };
  conversationCache.set(newConversation.id, conversation);

  return conversation;
}

// Sauvegarder un message
async function saveConversationMessage(conversationId, userId, userMessage, aiResponse, context, usage = {}) {
  const { data: message, error } = await supabase
    .from("ai_messages")
    .insert([{
      conversation_id: conversationId,
      user_id: userId,
      user_message: userMessage,
      ai_response: aiResponse,
      context: context,
      tokens_used: usage.total_tokens || 0,
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;

  // Mettre à jour le cache
  const conversation = conversationCache.get(conversationId);
  if (conversation) {
    conversation.messages.push(message);
    conversation.lastAccessed = Date.now();

    // Mettre à jour la date de modification
    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
  }

  return message;
}

// PROMPT SYSTÈME SÉCURISÉ
function buildSystemPrompt(userContext) {
  const { userRole, userData, platformContext, activities } = userContext;

  const SECURITY_RULES = `
# RÈGLES DE SÉCURITÉ STRICTES - IMPÉRATIF
- NE donne JAMAIS d'informations sur l'interface d'administration aux non-admins
- NE mentionne PAS les fonctionnalités admin aux vendeurs/acheteurs
- NE révèle PAS les statistiques globales de la plateforme
- NE parle PAS des paramètres système internes
- REDIRIGE vers le support pour les questions sensibles
- REFUSE de répondre aux questions sur la sécurité système
- NE donne AUCUNE information sur d'autres utilisateurs
- GARDE TOUTES les données confidentielles
`;

  const roleSpecificInstructions = {
    ADMIN: `Tu es l'assistant IA ADMINISTRATEUR de Digital Market Space.
Fonctions exclusives: analyse performances globales, rapports système, gestion plateforme.
ACCÈS COMPLET aux données et paramètres.`,

    VENDEUR: `Tu es l'assistant IA pour VENDEURS de Digital Market Space.
Fonctions: optimisation boutique, gestion produits, analyse ventes personnelles.
ACCÈS LIMITÉ à tes données personnelles uniquement.`,

    ACHETEUR: `Tu es l'assistant IA pour ACHETEURS de Digital Market Space.
Fonctions: recherche produits, création missions, processus d'achat.
ACCÈS LIMITÉ à tes données personnelles uniquement.`
  };

  const basePrompt = `
# Identité et Rôle
${roleSpecificInstructions[userRole] || roleSpecificInstructions.ACHETEUR}

${SECURITY_RULES}

# Règles de Réponse
- Réponds UNIQUEMENT en français
- Adapte tes réponses au rôle de l'utilisateur
- Ne dépasse JAMAIS les limites du rôle
- Pour les questions hors scope: "Je ne peux pas aider avec cette demande spécifique"

# Contexte Utilisateur Autorisé
- Rôle: ${userRole}
- Expérience: ${userData.joinCount} activités
- Statut: ${userData.isActive ? 'Actif' : 'Nouveau'}
${userRole !== 'ADMIN' ? `- Solde: ${userData.balance} XOF` : ''}
${userRole === 'VENDEUR' ? `- Boutiques: ${userData.shopCount}` : ''}

# Paramètres Plateforme (Visibles)
- Commission: ${platformContext.commissionRate}
- Délai retrait: ${platformContext.withdrawalProcess}
${userRole !== 'ADMIN' ? `- Retrait minimum: ${platformContext.minWithdrawal} XOF` : ''}

# Limites par Rôle
${userRole === 'ADMIN' ? 
  "✓ Accès complet aux données plateforme" :
  "✗ Accès limité à vos données personnelles uniquement"
}

${userRole === 'VENDEUR' ? 
  "✓ Accès à vos boutiques, produits et ventes" :
  "✗ Pas d'accès aux données autres vendeurs"
}

${userRole === 'ACHETEUR' ? 
  "✓ Accès à vos commandes et missions" :
  "✗ Pas d'accès aux données autres acheteurs"
}

Ton objectif: AIDER dans les limites strictes du rôle utilisateur.
  `;

  return basePrompt;
}

// Générer des suggestions rapides contextuelles
function generateQuickSuggestions(userContext, lastResponse) {
  const { userRole, userData } = userContext;

  const baseSuggestions = {
    ADMIN: [
      "Génère un rapport des performances du mois",
      "Analyse l'évolution des ventes par catégorie",
      "Identifie les vendeurs les plus actifs",
      "Suggestions d'amélioration de la plateforme",
      "Statistiques des commissions cette semaine"
    ],
    VENDEUR: userData.shopCount > 0 ? [
      "Comment optimiser mes descriptions de produits ?",
      "Quelle stratégie de prix recommander ?", 
      "Analyse mes statistiques de vente",
      "Comment augmenter ma visibilité ?",
      "Génère une description pour un nouveau produit"
    ] : [
      "Comment créer ma première boutique ?",
      "Quels produits vendre en ce moment ?",
      "Comment fixer mes prix ?",
      "Quelle commission vais-je payer ?",
      "Comment gérer mes stocks ?"
    ],
    ACHETEUR: [
      "Comment trouver le bon prestataire ?",
      "Explique le processus de création de mission",
      "Quels sont les délais moyens ?",
      "Comment sécuriser mes transactions ?",
      "Comment créer un brief de mission ?"
    ]
  };

  return baseSuggestions[userRole] || baseSuggestions.ACHETEUR;
}

function getFallbackContent(type, parameters) {
  const fallbacks = {
    product_description: `Découvrez notre ${parameters.productName} - ${parameters.features}. Produit de qualité, livraison rapide.`,
    mission_brief: `Mission: ${parameters.title}. Budget: ${parameters.budget}. Délai: ${parameters.deadline}. Compétences: ${parameters.skills}.`
  };

  return fallbacks[type] || "Contenu non disponible pour le moment.";
}

// FONCTIONS PRINCIPALES EXPORTÉES
export async function handleAIMessage(req, res) {
  const startTime = Date.now();

  try {
    const user = req.user.db;
    const { message, context = {} } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'unknown';

    // Validation
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ 
        error: "Message vide",
        code: "EMPTY_MESSAGE"
      });
    }

    if (message.length > 1000) {
      return res.status(400).json({
        error: "Message trop long (max 1000 caractères)",
        code: "MESSAGE_TOO_LONG"
      });
    }

    // 1. Préparer le contexte utilisateur
    const userContext = await contextService.buildUserContext(user, context);

    // 2. VALIDATION DE SÉCURITÉ
    try {
      validateUserAccess(userContext, message);
    } catch (accessError) {
      await addSecurityLog(user.id, 'ACCESS_VIOLATION_ATTEMPT', {
        message: message.substring(0, 100),
        userRole: userContext.userRole,
        ipAddress,
        userAgent
      });

      return res.json({
        message: "Je ne peux pas traiter cette demande. Pour les questions techniques, veuillez contacter le support.",
        suggestions: getSecurityFallbackSuggestions(userContext.userRole),
        isError: true,
        code: "ACCESS_RESTRICTED"
      });
    }

    // 3. Récupérer l'historique de conversation
    const conversationHistory = await getOrCreateConversation(user.id, context.conversationId);

    // 4. Construire le prompt contextuel sécurisé
    const systemPrompt = buildSystemPrompt(userContext);

    // 5. Appeler le service OpenAI avec timeout
    const aiResponse = await Promise.race([
      openAIService.sendMessage({
        message: message.trim(),
        systemPrompt,
        conversationHistory: conversationHistory.messages.slice(-6),
        userContext
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("TIMEOUT")), 30000)
      )
    ]);

    // 6. Sauvegarder la conversation
    const updatedConversation = await saveConversationMessage(
      conversationHistory.id,
      user.id,
      message,
      aiResponse.content,
      userContext,
      aiResponse.usage
    );

    // 7. Logger l'interaction
    const processingTime = Date.now() - startTime;
    await addLog(user.id, 'AI_ASSISTANT_QUERY', {
      conversationId: conversationHistory.id,
      messageLength: message.length,
      responseLength: aiResponse.content.length,
      tokensUsed: aiResponse.usage?.total_tokens,
      processingTime,
      ipAddress,
      userAgent: userAgent.substring(0, 200)
    });

    res.json({
      message: aiResponse.content,
      suggestions: generateQuickSuggestions(userContext, aiResponse.content),
      conversationId: conversationHistory.id,
      usage: aiResponse.usage,
      processingTime
    });

  } catch (error) {
    console.error("AI Assistant error:", error);

    // Logger l'erreur
    await addLog(req.user.db.id, 'AI_ASSISTANT_ERROR', {
      error: error.message,
      code: error.code
    });

    // Messages d'erreur spécifiques
    let errorMessage = "Je rencontre des difficultés techniques. Veuillez réessayer dans quelques instants.";
    let suggestions = ["Réessayer", "Contacter le support"];

    if (error.message.includes("TIMEOUT")) {
      errorMessage = "La requête a pris trop de temps. Veuillez réessayer avec une question plus courte.";
    } else if (error.message.includes("quota") || error.message.includes("billing")) {
      errorMessage = "Service IA temporairement indisponible. Notre équipe technique a été alertée.";
    }

    res.status(500).json({
      message: errorMessage,
      suggestions: suggestions,
      isError: true,
      code: error.message.includes("TIMEOUT") ? "TIMEOUT" : "SERVICE_UNAVAILABLE"
    });
  }
}

export async function generateAIContent(req, res) {
  try {
    const user = req.user.db;
    const { type, parameters } = req.body;

    const validTypes = ['product_description', 'mission_brief', 'shop_description', 'proposal_template'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: "Type de contenu non supporté",
        validTypes
      });
    }

    const content = await openAIService.generateContent(type, parameters, user);

    // Logger la génération
    await addLog(user.id, 'AI_CONTENT_GENERATION', {
      contentType: type,
      parameters: Object.keys(parameters),
      contentLength: content.length
    });

    res.json({ content, type });

  } catch (error) {
    console.error("Content generation error:", error);

    await addLog(req.user.db.id, 'AI_CONTENT_GENERATION_ERROR', {
      error: error.message,
      type: req.body.type
    });

    res.status(500).json({
      error: "Erreur lors de la génération de contenu",
      fallback: getFallbackContent(req.body.type, req.body.parameters)
    });
  }
}

export async function getConversations(req, res) {
  try {
    const user = req.user.db;
    const { limit = 20, offset = 0 } = req.query;

    const { data: conversations, error, count } = await supabase
      .from("ai_conversations")
      .select("id, title, created_at, updated_at, context", { count: 'exact' })
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({ 
      conversations: conversations || [], 
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function deleteConversation(req, res) {
  try {
    const user = req.user.db;
    const { conversationId } = req.params;

    // Vérifier que la conversation appartient à l'utilisateur
    const { data: conversation, error: checkError } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (checkError || !conversation) {
      return res.status(404).json({ error: "Conversation non trouvée" });
    }

    // Supprimer les messages d'abord
    const { error: messagesError } = await supabase
      .from("ai_messages")
      .delete()
      .eq("conversation_id", conversationId);

    if (messagesError) throw messagesError;

    // Supprimer la conversation
    const { error: convError } = await supabase
      .from("ai_conversations")
      .delete()
      .eq("id", conversationId);

    if (convError) throw convError;

    // Nettoyer le cache
    conversationCache.delete(conversationId);

    await addLog(user.id, 'AI_CONVERSATION_DELETED', { conversationId });

    res.json({ success: true, message: "Conversation supprimée" });

  } catch (error) {
    console.error("Delete conversation error:", error);
    res.status(500).json({ error: "Erreur lors de la suppression" });
  }
}

export default {
  handleAIMessage,
  generateAIContent,
  getConversations,
  deleteConversation
};
