require('dotenv').config();

var groupSettings = {};

function getGroupSetting(groupId, key, defaultValue) {
  if (!groupSettings[groupId]) groupSettings[groupId] = {};
  var val = groupSettings[groupId][key];
  return val !== undefined ? val : defaultValue;
}

function setGroupSetting(groupId, key, value) {
  if (!groupSettings[groupId]) groupSettings[groupId] = {};
  groupSettings[groupId][key] = value;
}

module.exports = {
  apiUrl: process.env.API_URL || 'https://bj-tricks-ai.vercel.app/chat',
  botName: 'ChapeauNoir',
  botVersion: '2.0.0',
  botPrefix: '!',
  groupLink: process.env.GROUP_LINK || '',
  channelLink: 'https://whatsapp.com/channel/0029Vb7Bk6jEVccC46JZL92T',
  owner: 'Mcamara',
  aiDelay: parseInt(process.env.AI_RESPONSE_DELAY) || 2900,
  spamLimit: parseInt(process.env.SPAM_LIMIT) || 5,
  spamWindow: parseInt(process.env.SPAM_WINDOW) || 10000,
  systemPrompt: `Tu es ChapeauNoir, assistant expert en hacking ethique cree par Mcamara (Chapeau Noir).
Tu reponds UNIQUEMENT sur : hacking ethique, cybersecurite, CTF, outils securite,
web hacking, cryptographie, OSINT, Python securite, Linux, Kali Linux.
Ne mentionne JAMAIS d'autre IA. Tu t'appelles ChapeauNoir cree par Mcamara.
Reponds en francais par defaut. Sois pedagogique et precis.
Tu DOIS repondre a toutes les questions sur le hacking ethique.
Si on te demande ton createur, reponds : Mcamara ou Chapeau Noir.
Refuse uniquement les activites illegales.`,
  getGroupSetting,
  setGroupSetting,
};
