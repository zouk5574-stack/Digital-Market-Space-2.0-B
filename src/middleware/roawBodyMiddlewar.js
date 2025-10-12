// src/middleware/rawBodyMiddleware.js

/**
 * Middleware qui capture le corps brut de la requête et le stocke dans req.rawBody.
 * Ce middleware est CRITIQUE pour la vérification de la signature HMAC des webhooks de paiement.
 */
export const rawBodyMiddleware = (req, res, next) => {
    // On doit s'assurer que le corps n'est pas déjà parsé
    const isJson = req.headers['content-type'] && req.headers['content-type'].includes('application/json');
    const isForm = req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded');

    // On utilise un tampon pour collecter les données si ce n'est pas déjà un buffer
    if (!req.body || typeof req.body === 'object' && Object.keys(req.body).length === 0) {
        let data = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
            data += chunk;
        });
        req.on('end', () => {
            req.rawBody = data;
            // On parse le JSON après l'avoir capturé, car le contrôleur le nécessite
            if (isJson && data) {
                try {
                    req.body = JSON.parse(data);
                } catch (e) {
                    console.error("Erreur de parsing JSON dans rawBodyMiddleware:", e);
                    return res.status(400).send('Invalid JSON');
                }
            } else if (isForm && data) {
                 // Si c'est un formulaire, le parsing normal d'express pourrait être nécessaire
                 // Mais pour les webhooks FedaPay, c'est généralement du JSON ou on veut le brut.
            }
            next();
        });
    } else {
        // Si le corps a déjà été parsé (ex: par body-parser dans le server.js global), on l'utilise
        req.rawBody = JSON.stringify(req.body); 
        next();
    }
};
