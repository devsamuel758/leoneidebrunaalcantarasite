// Servidor para gerenciar agendamentos e enviar notificações WhatsApp
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const normalizeTwilioNumber = (value) => {
    if (!value) return '';
    return value.replace(/^whatsapp:/i, '').trim();
};

const normalizeBrazilPhone = (value) => {
    if (!value) return '';
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
};

// IMPORTANTE: Configure estas variáveis no arquivo .env
// TWILIO_ACCOUNT_SID=seu_sid
// TWILIO_AUTH_TOKEN=seu_token
// TWILIO_PHONE=+14155238886  (ou whatsapp:+14155238886)
// OWNER_PHONE=85992532670

const twilioPhone = normalizeTwilioNumber(process.env.TWILIO_PHONE);
const ownerPhone = normalizeBrazilPhone(process.env.OWNER_PHONE);

// ============= Usando Twilio =============
const twilio = require('twilio');
const hasTwilioConfig = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    twilioPhone
);

const twilioClient = hasTwilioConfig
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

const formatarData = (data) => {
    if (!data) return 'Não informado';
    const dataObj = new Date(data);
    if (Number.isNaN(dataObj.getTime())) return String(data);
    return dataObj.toLocaleDateString('pt-BR');
};

const enviarMensagemWhatsApp = async ({ para, texto }) => {
    if (!twilioClient || !twilioPhone) {
        return {
            sucesso: true,
            modo: 'simulado',
            mensagem: 'WhatsApp simulado: configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_PHONE no arquivo .env',
            para,
            texto
        };
    }

    return twilioClient.messages.create({
        from: `whatsapp:${twilioPhone}`,
        to: `whatsapp:${para}`,
        body: texto
    });
};

// ============= Endpoint para enviar mensagem WhatsApp =============
app.post('/api/enviar-whatsapp', async (req, res) => {
    try {
        const { telefone, nome, data, hora, servicos, tipo = 'cliente' } = req.body;

        if (!telefone || !nome) {
            return res.status(400).json({ erro: 'Telefone e nome são obrigatórios' });
        }

        let mensagem = '';
        const formattedPhone = normalizeBrazilPhone(telefone);

        if (!formattedPhone) {
            return res.status(400).json({ erro: 'Telefone informado é inválido' });
        }

        if (tipo === 'cliente') {
            const servicosTexto = Array.isArray(servicos) ? servicos.join(', ') : (servicos || 'Não informado');
            mensagem = `🎀 *Confirmação de Agendamento* 🎀\n\n` +
                `Olá ${nome}! Seu agendamento foi confirmado:\n\n` +
                `📅 Data: ${formatarData(data)}\n` +
                `⏰ Horário: ${hora}\n` +
                `💅 Serviços: ${servicosTexto}\n\n` +
                `Qualquer dúvida, nos chame!\n\n` +
                `*Bruna Nail* ✨`;
        } else if (tipo === 'admin') {
            const servicosTexto = Array.isArray(servicos) ? servicos.join(', ') : (servicos || 'Não informado');
            mensagem = `⏰ *NOVO AGENDAMENTO* ⏰\n\n` +
                `👤 Cliente: ${nome}\n` +
                `📱 WhatsApp: ${telefone}\n` +
                `📅 Data: ${formatarData(data)}\n` +
                `⏰ Horário: ${hora}\n` +
                `💅 Serviços: ${servicosTexto}`;
        }

        const result = await enviarMensagemWhatsApp({
            para: formattedPhone,
            texto: mensagem
        });

        if (result && result.modo === 'simulado') {
            return res.json({
                sucesso: true,
                mensagem: 'Mensagem simulada com sucesso',
                modo: 'simulado',
                aviso: 'Configure o Twilio no arquivo .env para enviar mensagens reais.'
            });
        }

        console.log(`Mensagem enviada para ${formattedPhone}`);
        res.json({ 
            sucesso: true, 
            mensagem: 'Mensagem enviada com sucesso',
            messageSid: result.sid 
        });

    } catch (erro) {
        console.error('Erro ao enviar WhatsApp:', erro);
        res.status(502).json({ 
            erro: 'Erro ao enviar mensagem via WhatsApp',
            detalhes: erro.message || 'Falha na integração com o provedor de mensagens.'
        });
    }
});

// ============= Endpoint para notificar admin =============
app.post('/api/notificar-admin', async (req, res) => {
    try {
        const { nome, data, hora, servicos, telefone } = req.body;
        const destinoAdmin = normalizeBrazilPhone(process.env.OWNER_PHONE || telefone || ownerPhone);

        if (!nome || !destinoAdmin) {
            return res.status(400).json({ erro: 'Nome e telefone do admin são obrigatórios' });
        }

        const servicosTexto = Array.isArray(servicos) ? servicos.join(', ') : (servicos || 'Não informado');
        const mensagem = `🔔 *NOVO AGENDAMENTO* 🔔\n\n` +
            `👤 ${nome}\n` +
            `📱 ${telefone}\n` +
            `📅 ${formatarData(data)}\n` +
            `⏰ ${hora}\n` +
            `💅 ${servicosTexto}`;

        const result = await enviarMensagemWhatsApp({
            para: destinoAdmin,
            texto: mensagem
        });

        if (result && result.modo === 'simulado') {
            return res.json({
                sucesso: true,
                mensagem: 'Notificação simulada',
                modo: 'simulado',
                aviso: 'Configure o Twilio no arquivo .env para enviar notificações reais.'
            });
        }

        res.json({ sucesso: true });
    } catch (erro) {
        console.error('Erro ao notificar admin:', erro);
        res.status(502).json({ erro: erro.message || 'Erro ao notificar admin' });
    }
});

app.listen(PORT, () => {
    console.log(`🎉 Servidor rodando em http://localhost:${PORT}`);
    if (!hasTwilioConfig) {
        console.log(`⚠️  Twilio não configurado. O app continuará em modo simulado. Configure .env com TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_PHONE.`);
    } else {
        console.log(`✅ Twilio configurado e pronto para enviar mensagens.`);
    }
});
