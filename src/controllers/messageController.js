import { supabase } from '../config/supabase.js';
import Joi from 'joi';

const messageValidation = {
  createConversation: Joi.object({
    participant_id: Joi.string().uuid().required(),
    subject: Joi.string().max(255).required(),
    initial_message: Joi.string().min(1).max(1000).required()
  }),
  sendMessage: Joi.object({
    conversation_id: Joi.string().uuid().required(),
    content: Joi.string().min(1).max(2000).required(),
    message_type: Joi.string().valid('text', 'image', 'file', 'system').default('text'),
    attachment_url: Joi.string().uri().optional()
  }),
  getConversations: Joi.object({
    page: Joi.number().min(1).default(1),
    limit: Joi.number().min(1).max(50).default(20)
  })
};

export const createConversation = async (req, res) => {
  try {
    const { error, value } = messageValidation.createConversation.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    // Vérifier que le participant existe
    const { data: participant, error: userError } = await supabase
      .from('users')
      .select('id, first_name, role')
      .eq('id', value.participant_id)
      .single();

    if (userError || !participant) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Vérifier qu'une conversation n'existe pas déjà
    const { data: existingConv, error: convError } = await supabase
      .from('conversations')
      .select(`
        id,
        conversation_participants!inner(user_id)
      `)
      .eq('conversation_participants.user_id', req.user.id)
      .eq('conversation_participants.user_id', value.participant_id)
      .single();

    if (existingConv) {
      return res.status(409).json({ 
        error: 'Conversation déjà existante',
        conversation_id: existingConv.id 
      });
    }

    // Créer la conversation
    const { data: conversation, error: createError } = await supabase
      .from('conversations')
      .insert({
        subject: value.subject,
        created_by: req.user.id,
        last_message_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) throw createError;

    // Ajouter les participants
    const { error: participantsError } = await supabase
      .from('conversation_participants')
      .insert([
        { conversation_id: conversation.id, user_id: req.user.id, role: 'creator' },
        { conversation_id: conversation.id, user_id: value.participant_id, role: 'participant' }
      ]);

    if (participantsError) throw participantsError;

    // Envoyer le message initial
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        sender_id: req.user.id,
        content: value.initial_message,
        message_type: 'text'
      })
      .select(`
        *,
        sender:users(first_name, avatar_url)
      `)
      .single();

    if (messageError) throw messageError;

    // Mettre à jour last_message
    await supabase
      .from('conversations')
      .update({ 
        last_message_id: message.id,
        last_message_at: message.created_at
      })
      .eq('id', conversation.id);

    res.json({ 
      success: true, 
      data: { 
        conversation: {
          ...conversation,
          participants: [req.user, participant],
          last_message: message
        }
      } 
    });

  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Erreur création conversation' });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { error, value } = messageValidation.sendMessage.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    // Vérifier que l'utilisateur participe à la conversation
    const { data: participant, error: partError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('conversation_id', value.conversation_id)
      .eq('user_id', req.user.id)
      .single();

    if (partError || !participant) {
      return res.status(403).json({ error: 'Accès à la conversation refusé' });
    }

    // Créer le message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: value.conversation_id,
        sender_id: req.user.id,
        content: value.content,
        message_type: value.message_type,
        attachment_url: value.attachment_url
      })
      .select(`
        *,
        sender:users(first_name, avatar_url)
      `)
      .single();

    if (messageError) throw messageError;

    // Mettre à jour la conversation
    await supabase
      .from('conversations')
      .update({ 
        last_message_id: message.id,
        last_message_at: message.created_at,
        updated_at: new Date().toISOString()
      })
      .eq('id', value.conversation_id);

    // Notifier les participants (pour WebSocket future implémentation)
    await notifyParticipants(value.conversation_id, message);

    res.json({ success: true, data: message });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Erreur envoi message' });
  }
};

export const getConversations = async (req, res) => {
  try {
    const { error, value } = messageValidation.getConversations.validate(req.query);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { page, limit } = value;
    const startIndex = (page - 1) * limit;

    const { data: conversations, error: convError, count } = await supabase
      .from('conversation_participants')
      .select(`
        conversation:conversations(
          id,
          subject,
          created_at,
          last_message_at,
          last_message_id,
          messages!last_message_id(
            content,
            created_at,
            sender:users(first_name, avatar_url)
          ),
          participants:conversation_participants(
            user:users(
              id,
              first_name,
              avatar_url,
              role
            )
          )
        )
      `, { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('last_message_at', { foreignTable: 'conversations', ascending: false })
      .range(startIndex, startIndex + limit - 1);

    if (convError) throw convError;

    res.json({
      success: true,
      data: conversations.map(c => c.conversation),
      pagination: {
        current_page: page,
        total_pages: Math.ceil(count / limit),
        total_items: count,
        items_per_page: limit
      }
    });

  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Erreur récupération conversations' });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    const { error: valError } = Joi.object({
      conversationId: Joi.string().uuid().required()
    }).validate({ conversationId });
    if (valError) return res.status(400).json({ error: valError.details[0].message });

    const { page = 1, limit = 50 } = req.query;
    const startIndex = (page - 1) * limit;

    // Vérifier l'accès
    const { data: access, error: accessError } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', req.user.id)
      .single();

    if (accessError || !access) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { data: messages, error: messagesError, count } = await supabase
      .from('messages')
      .select(`
        *,
        sender:users(first_name, avatar_url, role)
      `, { count: 'exact' })
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(startIndex, startIndex + limit - 1);

    if (messagesError) throw messagesError;

    res.json({
      success: true,
      data: messages.reverse(), // Plus récent en dernier
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        items_per_page: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Erreur récupération messages' });
  }
};

// Fonction utilitaire pour notifications
const notifyParticipants = async (conversationId, message) => {
  try {
    const { data: participants, error } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', message.sender_id);

    if (error) return;

    // Créer notifications pour chaque participant
    const notifications = participants.map(participant => ({
      user_id: participant.user_id,
      type: 'new_message',
      title: 'Nouveau message',
      message: `Nouveau message dans la conversation`,
      data: {
        conversation_id: conversationId,
        message_id: message.id,
        sender_name: message.sender?.first_name || 'Utilisateur'
      },
      read: false
    }));

    await supabase
      .from('notifications')
      .insert(notifications);

  } catch (error) {
    console.error('Notification error:', error);
  }
};
