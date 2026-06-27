var config = require('./config');
var memberManager = require('./memberManager');
var ai = require('./ai');
var antiSpam = require('./antiSpam');
var groupSettings = require('./groupSettings');
var os = require('os');
var fs = require('fs');
var path = require('path');
var https = require('https');
var http = require('http');

var botActive = true;
var startTime = Date.now();
function isBotActive() { return botActive; }
function setBotActive(state) { botActive = state; }

// ─── Storage ──────────────────────────────────────────────────
var DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
function loadJson(f, d) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')); } catch(e) { return d; } }
function saveJson(f, d) { try { fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(d, null, 2)); } catch(e) {} }

// ─── Jeux actifs ──────────────────────────────────────────────
var triviaGames = {};
var hangmanGames = {};
var aovSessions = {};   // action ou verite
var mathGames = {};
var quizHackGames = {};
var pollData = {};

// ─── Helpers ─────────────────────────────────────────────────
function formatUptime() {
  var ms = Date.now() - startTime;
  var s=Math.floor((ms/1000)%60), m=Math.floor((ms/60000)%60), h=Math.floor((ms/3600000)%24), d=Math.floor(ms/86400000);
  if(d>0) return d+'j '+h+'h '+m+'m';
  if(h>0) return h+'h '+m+'m '+s+'s';
  if(m>0) return m+'m '+s+'s';
  return s+'s';
}
function getRam() { return Math.round(process.memoryUsage().heapUsed/1024/1024)+'MB/'+Math.round(os.totalmem()/1024/1024)+'MB'; }
function channelFooter() { return '\n\n> 🎩 *ChapeauNoir* | Mcamara\n> 📡 '+config.channelLink; }
function rand(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

function fetchJson(url) {
  return new Promise(function(resolve, reject) {
    var lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'ChapeauNoir/2.0' } }, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302) return fetchJson(res.headers.location).then(resolve).catch(reject);
      var d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}
function fetchBuffer(url) {
  return new Promise(function(resolve, reject) {
    var lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'ChapeauNoir/2.0' } }, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302) return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      var chunks = []; res.on('data', function(c) { chunks.push(c); }); res.on('end', function() { resolve(Buffer.concat(chunks)); });
    }).on('error', reject);
  });
}

// ─── Msg/mention helpers ──────────────────────────────────────
function getQuoted(msg) { return msg.message&&msg.message.extendedTextMessage&&msg.message.extendedTextMessage.contextInfo&&msg.message.extendedTextMessage.contextInfo.quotedMessage||null; }
function getQuotedParticipant(msg) { return msg.message&&msg.message.extendedTextMessage&&msg.message.extendedTextMessage.contextInfo&&msg.message.extendedTextMessage.contextInfo.participant||null; }
function getMentioned(msg) { return (msg.message&&msg.message.extendedTextMessage&&msg.message.extendedTextMessage.contextInfo&&msg.message.extendedTextMessage.contextInfo.mentionedJid)||[]; }
function getTarget(msg) { var m=getMentioned(msg); return m.length?m[0]:getQuotedParticipant(msg); }

// ─── Admin check ─────────────────────────────────────────────
async function checkAdmin(sock, groupId, senderId) {
  try {
    var meta = await sock.groupMetadata(groupId);
    var admins = meta.participants.filter(function(p){return p.admin;}).map(function(p){return p.id;});
    var botId = (sock.user.id||'').split(':')[0]+'@s.whatsapp.net';
    return { isSenderAdmin: admins.includes(senderId), isBotAdmin: admins.includes(botId), admins: admins, meta: meta };
  } catch(e) { return { isSenderAdmin:false, isBotAdmin:false, admins:[], meta:null }; }
}

// ─── Warns ───────────────────────────────────────────────────
function getWarns(g,u){var d=loadJson('warnings.json',{});return(d[g]&&d[g][u])||0;}
function addWarn(g,u){var d=loadJson('warnings.json',{});if(!d[g])d[g]={};d[g][u]=(d[g][u]||0)+1;saveJson('warnings.json',d);return d[g][u];}
function resetWarns(g,u){var d=loadJson('warnings.json',{});if(d[g])d[g][u]=0;saveJson('warnings.json',d);}

// ─── Message count ────────────────────────────────────────────
function incCount(g,u){var d=loadJson('msgcount.json',{});if(!d[g])d[g]={};d[g][u]=(d[g][u]||0)+1;saveJson('msgcount.json',d);}
function getTop(g,n){var d=loadJson('msgcount.json',{});var gr=d[g]||{};return Object.entries(gr).sort(function(a,b){return b[1]-a[1];}).slice(0,n||10);}

// ─── Fancy text maps ─────────────────────────────────────────
var MAPS = {
  cursive: {'a':'𝒶','b':'𝒷','c':'𝒸','d':'𝒹','e':'𝑒','f':'𝒻','g':'𝑔','h':'𝒽','i':'𝒾','j':'𝒿','k':'𝓀','l':'𝓁','m':'𝓂','n':'𝓃','o':'𝑜','p':'𝓅','q':'𝓆','r':'𝓇','s':'𝓈','t':'𝓉','u':'𝓊','v':'𝓋','w':'𝓌','x':'𝓍','y':'𝓎','z':'𝓏','A':'𝒜','B':'𝐵','C':'𝒞','D':'𝒟','E':'𝐸','F':'𝐹','G':'𝒢','H':'𝐻','I':'𝐼','J':'𝒥','K':'𝒦','L':'𝐿','M':'𝑀','N':'𝒩','O':'𝒪','P':'𝒫','Q':'𝒬','R':'𝑅','S':'𝒮','T':'𝒯','U':'𝒰','V':'𝒱','W':'𝒲','X':'𝒳','Y':'𝒴','Z':'𝒵'},
  bold: {'a':'𝐚','b':'𝐛','c':'𝐜','d':'𝐝','e':'𝐞','f':'𝐟','g':'𝐠','h':'𝐡','i':'𝐢','j':'𝐣','k':'𝐤','l':'𝐥','m':'𝐦','n':'𝐧','o':'𝐨','p':'𝐩','q':'𝐪','r':'𝐫','s':'𝐬','t':'𝐭','u':'𝐮','v':'𝐯','w':'𝐰','x':'𝐱','y':'𝐲','z':'𝐳','A':'𝐀','B':'𝐁','C':'𝐂','D':'𝐃','E':'𝐄','F':'𝐅','G':'𝐆','H':'𝐇','I':'𝐈','J':'𝐉','K':'𝐊','L':'𝐋','M':'𝐌','N':'𝐍','O':'𝐎','P':'𝐏','Q':'𝐐','R':'𝐑','S':'𝐒','T':'𝐓','U':'𝐔','V':'𝐕','W':'𝐖','X':'𝐗','Y':'𝐘','Z':'𝐙'},
  italic: {'a':'𝘢','b':'𝘣','c':'𝘤','d':'𝘥','e':'𝘦','f':'𝘧','g':'𝘨','h':'𝘩','i':'𝘪','j':'𝘫','k':'𝘬','l':'𝘭','m':'𝘮','n':'𝘯','o':'𝘰','p':'𝘱','q':'𝘲','r':'𝘳','s':'𝘴','t':'𝘵','u':'𝘶','v':'𝘷','w':'𝘸','x':'𝘹','y':'𝘺','z':'𝘻','A':'𝘈','B':'𝘉','C':'𝘊','D':'𝘋','E':'𝘌','F':'𝘍','G':'𝘎','H':'𝘏','I':'𝘐','J':'𝘑','K':'𝘒','L':'𝘓','M':'𝘔','N':'𝘕','O':'𝘖','P':'𝘗','Q':'𝘘','R':'𝘙','S':'𝘚','T':'𝘛','U':'𝘜','V':'𝘝','W':'𝘞','X':'𝘟','Y':'𝘠','Z':'𝘡'}
};
function applyMap(map, text) { return text.split('').map(function(c){return map[c]||c;}).join(''); }
function fancyFlip(text) { var f={'a':'ɐ','b':'q','c':'ɔ','d':'p','e':'ǝ','f':'ɟ','g':'ƃ','h':'ɥ','i':'ᴉ','j':'ɾ','k':'ʞ','l':'l','m':'ɯ','n':'u','o':'o','p':'d','q':'b','r':'ɹ','s':'s','t':'ʇ','u':'n','v':'ʌ','w':'ʍ','x':'x','y':'ʎ','z':'z','A':'∀','B':'𝐵','C':'Ɔ','D':'◖','E':'Ǝ','F':'Ⅎ','G':'פ','H':'H','I':'I','J':'ɾ','K':'ʞ','L':'˥','M':'W','N':'N','O':'O','P':'Ԁ','Q':'Q','R':'ɹ','S':'S','T':'┴','U':'∩','V':'Λ','W':'M','X':'X','Y':'⅄','Z':'Z'}; return text.split('').map(function(c){return f[c]||c;}).reverse().join(''); }

// ─── Données fun ─────────────────────────────────────────────
var COMPLIMENTS=['Tu es vraiment brillant(e) ! 🌟','Tu as un sourire magnifique 😊','Tu es une inspiration pour tous 💡','Ta générosité est sans limite 💖','Le monde est meilleur avec toi 🌍','Tu es plus courageux(se) que tu ne le penses 💪','Tes idées sont toujours brillantes 🎯','Tu as un cœur en or 💛'];
var INSULTS_FUN=['Tu es comme un Wi-Fi coupé quand on a besoin de toi 📶','Ton cerveau tourne sous Windows 95 💾','Tu es comme lundi matin — personne ne t\'attend 😴','Tu es si ennuyeux(se) que tu ferais dormir un café ☕','Tu es comme une pizza froide — décevant à chaque fois 🍕'];
var EIGHT_BALL=['Oui, absolument ! 🎱','Non, clairement ! 🎱','Demande plus tard 🎱','C\'est certain 🎱','Très douteux 🎱','Sans aucun doute 🎱','Ma réponse est non 🎱','Les signes pointent vers oui 🎱','Impossible à dire maintenant 🎱'];
var TRUTHS=['Quelle est la chose la plus embarrassante qui te soit arrivée ?','Quel est ton secret le plus honteux ?','As-tu déjà menti à ton meilleur ami ?','Quelle est la chose la plus folle que tu aies faite ?','As-tu un crush dans ce groupe ? 😏','Quelle est ta plus grande peur ?','As-tu déjà triché à un examen ?','Quel est le mensonge le plus récent que tu aies dit ?','Quelle est ta mauvaise habitude secrète ?','Qui dans ce groupe tu appellerais à 3h du matin ?','Quelle est la chose dont tu n\'es pas fier(e) ?','As-tu déjà eu honte de tes parents ?','Quel est ton rêve inavouable ?','As-tu déjà espionné quelqu\'un ?','Quel est le truc le plus bizarre que tu aies mangé ?'];
var DARES=['Envoie un message d\'amour à la dernière personne dans tes contacts 💌','Fais un selfie ridicule et partage-le ici 🤳','Écris un poème de 4 vers maintenant 📝','Envoie un vocal en chantant 10 secondes 🎵','Dis 3 choses positives sur chaque membre du groupe 🌟','Raconte une blague que tout le monde note /10 🎭','Imite la voix d\'un robot pendant le prochain message vocal 🤖','Écris un haïku sur la cybersécurité maintenant 🎋','Envoie un sticker qui te représente 100% 😄','Nomme 5 pays en 10 secondes 🌍'];
var FLIRTS=['Si tu étais une étoile, tu serais la plus brillante du ciel ⭐','Ton sourire illumine toute une pièce 😊✨','Je cherchais le bonheur et je t\'ai trouvé(e) 💕','Tu es comme le soleil : tu réchauffes tout ce qui t\'entoure ☀️','Si la beauté était un crime, tu ferais de la prison à vie 😍🔒'];
var GOODNIGHTS=['Bonne nuit ! Que tes rêves soient aussi beaux que toi 🌙✨','Dors bien ! Demain sera encore plus beau 🌟💫','Que les étoiles veillent sur toi cette nuit 🌠','Bonne nuit ! Tu as mérité ce repos 😴💤','Ferme les yeux, laisse l\'univers te porter 🌌'];

// ─── Quiz hacking ─────────────────────────────────────────────
var QUIZ_HACK = [
  {q:'Quel outil est utilisé pour scanner les ports ouverts ?',a:'nmap',opts:['nmap','metasploit','wireshark','burpsuite']},
  {q:'Qu\'est-ce qu\'une attaque SQLi ?',a:'injection sql',opts:['injection sql','cross site scripting','buffer overflow','brute force']},
  {q:'Quel protocole chiffre le trafic web ?',a:'https',opts:['https','http','ftp','smtp']},
  {q:'Qu\'est-ce que XSS ?',a:'cross site scripting',opts:['cross site scripting','injection sql','man in the middle','phishing']},
  {q:'Quel framework est dédié au pentest ?',a:'metasploit',opts:['metasploit','django','react','laravel']},
  {q:'Quelle distribution Linux est utilisée en cybersécurité ?',a:'kali linux',opts:['kali linux','ubuntu','windows','centos']},
  {q:'Qu\'est-ce qu\'un payload ?',a:'code malveillant executé',opts:['code malveillant executé','mot de passe','firewall','cookie']},
  {q:'Quel outil capture le trafic réseau ?',a:'wireshark',opts:['wireshark','nmap','john the ripper','hydra']},
  {q:'Qu\'est-ce que le OSINT ?',a:'renseignement en sources ouvertes',opts:['renseignement en sources ouvertes','attaque réseau','virus','rootkit']},
  {q:'Quel outil casse les mots de passe ?',a:'hashcat',opts:['hashcat','nmap','burpsuite','sqlmap']},
  {q:'Qu\'est-ce qu\'un CVE ?',a:'vulnerabilite connue et repertoriee',opts:['vulnerabilite connue et repertoriee','logiciel antivirus','firewall','proxy']},
  {q:'Quelle commande Linux affiche les connexions réseau ?',a:'netstat',opts:['netstat','ls','cd','grep']},
  {q:'Qu\'est-ce qu\'un exploit 0-day ?',a:'vulnerabilite non encore corrigee',opts:['vulnerabilite non encore corrigee','antivirus puissant','vpn','proxy']},
  {q:'Qu\'est-ce que le phishing ?',a:'tentative de hameconnage',opts:['tentative de hameconnage','scan de ports','injection sql','ddos']},
  {q:'Que signifie CTF ?',a:'capture the flag',opts:['capture the flag','cyber threat framework','computer task force','critical transfer file']}
];

// ─── Calcul mental ────────────────────────────────────────────
function genMath() {
  var ops=['+','-','*']; var op=rand(ops);
  var a,b,ans;
  if(op==='+'){a=Math.floor(Math.random()*100)+1;b=Math.floor(Math.random()*100)+1;ans=a+b;}
  else if(op==='-'){a=Math.floor(Math.random()*100)+10;b=Math.floor(Math.random()*a)+1;ans=a-b;}
  else{a=Math.floor(Math.random()*12)+2;b=Math.floor(Math.random()*12)+2;ans=a*b;}
  return {question:a+' '+op+' '+b+' = ?',answer:ans};
}

// ─── Buttons helper ───────────────────────────────────────────
function makeButtons(rows) {
  return rows.map(function(r,i) {
    return { buttonId: r.id||('btn_'+i), buttonText: { displayText: (r.emoji?r.emoji+' ':'')+r.text }, type: 1 };
  });
}

// ════════════════════════════════════════════════════════════
// ─── COMMANDES ADMIN ────────────────────────────────────────
// ════════════════════════════════════════════════════════════
async function handleAdminCommand(sock, msg, command, args, senderId, groupId) {
  var adm = await checkAdmin(sock, groupId, senderId);
  switch (command) {

    case '!on':
      botActive = true;
      await sock.sendMessage(groupId, { text: '✅ *ChapeauNoir activé !* 🎩' + channelFooter() });
      break;
    case '!off':
      botActive = false;
      await sock.sendMessage(groupId, { text: '🔴 *ChapeauNoir désactivé.*' + channelFooter() });
      break;

    case '!ban': {
      var banT = getTarget(msg);
      if (!banT) { await sock.sendMessage(groupId, { text: '❌ Mentionne ou réponds à un membre.' }); break; }
      var banR = args.join(' ') || 'Violation des règles';
      await memberManager.banMember(banT, banR);
      await sock.groupParticipantsUpdate(groupId, [banT], 'remove').catch(function(){});
      await sock.sendMessage(groupId, { text: '🚫 @'+banT.split('@')[0]+' banni.\n📋 Raison: '+banR+channelFooter(), mentions:[banT] });
      break;
    }
    case '!unban': {
      if (args[0]) {
        var ubJid = args[0]+'@s.whatsapp.net';
        await memberManager.unbanMember(ubJid); antiSpam.unbanUser(ubJid);
        await sock.sendMessage(groupId, { text: '✅ '+args[0]+' débanni.'+channelFooter() });
      }
      break;
    }
    case '!kick': {
      var kickT = getTarget(msg);
      if (!kickT) { await sock.sendMessage(groupId,{text:'❌ Mentionne ou réponds au membre.'}); break; }
      await sock.groupParticipantsUpdate(groupId,[kickT],'remove').catch(function(){});
      await sock.sendMessage(groupId,{text:'👢 @'+kickT.split('@')[0]+' expulsé.'+channelFooter(),mentions:[kickT]});
      break;
    }
    case '!promote': {
      var promT = getTarget(msg);
      if (!promT) { await sock.sendMessage(groupId,{text:'❌ Mentionne ou réponds au membre.'}); break; }
      await sock.groupParticipantsUpdate(groupId,[promT],'promote').catch(function(){});
      await sock.sendMessage(groupId,{text:'⬆️ @'+promT.split('@')[0]+' promu admin.'+channelFooter(),mentions:[promT]});
      break;
    }
    case '!demote': {
      var demT = getTarget(msg);
      if (!demT) { await sock.sendMessage(groupId,{text:'❌ Mentionne ou réponds au membre.'}); break; }
      await sock.groupParticipantsUpdate(groupId,[demT],'demote').catch(function(){});
      await sock.sendMessage(groupId,{text:'⬇️ @'+demT.split('@')[0]+' rétrogradé.'+channelFooter(),mentions:[demT]});
      break;
    }
    case '!mute':
      await sock.groupSettingUpdate(groupId,'announcement').catch(function(){});
      await sock.sendMessage(groupId,{text:'🔇 *Groupe muté.* Seuls les admins peuvent écrire.'+channelFooter()});
      break;
    case '!unmute':
      await sock.groupSettingUpdate(groupId,'not_announcement').catch(function(){});
      await sock.sendMessage(groupId,{text:'🔊 *Groupe démuté.*'+channelFooter()});
      break;

    case '!tagall':
    case '!hidetag': {
      var tagTxt = args.join(' ') || '📢 Message à tous les membres';
      var tagMeta = await sock.groupMetadata(groupId).catch(function(){return null;});
      if (!tagMeta) { await sock.sendMessage(groupId,{text:'❌ Erreur groupe.'}); break; }
      var allIds = tagMeta.participants.map(function(p){return p.id;});
      await sock.sendMessage(groupId,{text:command==='!tagall'?tagTxt:' ',mentions:allIds});
      break;
    }

    case '!welcome': case '!goodbye': case '!antilink': case '!antispam': case '!antimedia': case '!antidelete': {
      var tKey = command.replace('!','');
      var tSub = args[0]?args[0].toLowerCase():'';
      var tNames = {welcome:'Bienvenue',goodbye:'Au revoir',antilink:'Anti-liens',antispam:'Anti-spam',antimedia:'Anti-media',antidelete:'Anti-suppression'};
      if (tSub==='on') { groupSettings.set(groupId,tKey,true); await sock.sendMessage(groupId,{text:'✅ *'+tNames[tKey]+' activé*'+channelFooter()}); }
      else if (tSub==='off') { groupSettings.set(groupId,tKey,false); await sock.sendMessage(groupId,{text:'❌ *'+tNames[tKey]+' désactivé*'+channelFooter()}); }
      else {
        var tSt = groupSettings.get(groupId,tKey,false)?'✅ Activé':'❌ Désactivé';
        await sock.sendMessage(groupId,{text:'╭━ *'+tNames[tKey].toUpperCase()+'* ━\n┃ Statut: '+tSt+'\n┃ !'+tKey+' on → Activer\n┃ !'+tKey+' off → Désactiver\n╰━━━'+channelFooter()});
      }
      break;
    }

    case '!antibadword': {
      var abSub = args[0]?args[0].toLowerCase():'';
      if (abSub==='on') { groupSettings.set(groupId,'antibadword',true); await sock.sendMessage(groupId,{text:'🤬 Anti-grossièretés activé.'+channelFooter()}); }
      else if (abSub==='off') { groupSettings.set(groupId,'antibadword',false); await sock.sendMessage(groupId,{text:'✅ Anti-grossièretés désactivé.'+channelFooter()}); }
      else if (abSub==='add'&&args[1]) { var bwL=loadJson('badwords.json',[]); var nw=args.slice(1).join(' ').toLowerCase(); if(!bwL.includes(nw))bwL.push(nw); saveJson('badwords.json',bwL); await sock.sendMessage(groupId,{text:'✅ Mot ajouté: *'+nw+'*'+channelFooter()}); }
      else if (abSub==='remove'&&args[1]) { var bwL2=loadJson('badwords.json',[]).filter(function(w){return w!==args.slice(1).join(' ').toLowerCase();}); saveJson('badwords.json',bwL2); await sock.sendMessage(groupId,{text:'✅ Mot supprimé.'+channelFooter()}); }
      else if (abSub==='list') { var bwL3=loadJson('badwords.json',[]); await sock.sendMessage(groupId,{text:'🤬 *Mots bannis:*\n'+(bwL3.length?bwL3.join(', '):'(aucun)')+channelFooter()}); }
      else await sock.sendMessage(groupId,{text:'╭━ *ANTIBADWORD* ━\n┃ !antibadword on/off\n┃ !antibadword add <mot>\n┃ !antibadword remove <mot>\n┃ !antibadword list\n╰━━━'+channelFooter()});
      break;
    }

    case '!warn': {
      var wT = getTarget(msg);
      if (!wT||!adm.isSenderAdmin) { await sock.sendMessage(groupId,{text:'❌ '+(adm.isSenderAdmin?'Mentionne un membre.':'Admin seulement.')}); break; }
      var wC = addWarn(groupId,wT);
      var wMsg = '⚠️ @'+wT.split('@')[0]+' averti ('+wC+'/3).';
      if (wC>=3) { wMsg+='\n\n🚫 *3 avertissements — Expulsion !*'; await sock.groupParticipantsUpdate(groupId,[wT],'remove').catch(function(){}); resetWarns(groupId,wT); }
      await sock.sendMessage(groupId,{text:wMsg+channelFooter(),mentions:[wT]});
      break;
    }
    case '!warnings': {
      var wwT = getTarget(msg)||senderId; var wwC = getWarns(groupId,wwT);
      await sock.sendMessage(groupId,{text:'⚠️ @'+wwT.split('@')[0]+' a *'+wwC+'/3* avertissement(s).'+channelFooter(),mentions:[wwT]});
      break;
    }
    case '!resetwarn': {
      var rwT = getTarget(msg);
      if (rwT) { resetWarns(groupId,rwT); await sock.sendMessage(groupId,{text:'✅ Avertissements réinitialisés pour @'+rwT.split('@')[0]+'.'+channelFooter(),mentions:[rwT]}); }
      break;
    }

    case '!private': {
      await sock.groupSettingUpdate(groupId,'announcement').catch(function(){});
      groupSettings.set(groupId,'private',true);
      await sock.sendMessage(groupId,{text:'🔒 *Groupe passé en mode PRIVÉ*\nSeuls les admins peuvent écrire.\n\nUtilise *!public* pour ouvrir.'+channelFooter()});
      break;
    }
    case '!public': {
      await sock.groupSettingUpdate(groupId,'not_announcement').catch(function(){});
      groupSettings.set(groupId,'private',false);
      await sock.sendMessage(groupId,{text:'🔓 *Groupe passé en mode PUBLIC*\nTous les membres peuvent écrire.\n\nUtilise *!private* pour fermer.'+channelFooter()});
      break;
    }

    case '!purge': {
      if (!adm.isSenderAdmin||!adm.isBotAdmin) { await sock.sendMessage(groupId,{text:'❌ Bot admin + admin requis.'}); break; }
      var pMeta = await sock.groupMetadata(groupId).catch(function(){return null;}); if(!pMeta)break;
      var toRm = pMeta.participants.filter(function(p){return !p.admin;}).map(function(p){return p.id;});
      if(!toRm.length){await sock.sendMessage(groupId,{text:'ℹ️ Aucun membre non-admin.'});break;}
      await sock.sendMessage(groupId,{text:'⏳ Expulsion de '+toRm.length+' membres...'});
      for(var pi=0;pi<toRm.length;pi+=5){await sock.groupParticipantsUpdate(groupId,toRm.slice(pi,pi+5),'remove').catch(function(){});await new Promise(function(r){setTimeout(r,1000);});}
      await sock.sendMessage(groupId,{text:'✅ *Purge terminée.* '+toRm.length+' expulsés.'+channelFooter()});
      break;
    }

    case '!resetlink': {
      if (!adm.isBotAdmin) { await sock.sendMessage(groupId,{text:'❌ Bot doit être admin.'}); break; }
      var newC = await sock.groupRevokeInvite(groupId).catch(function(){return null;});
      if (newC) await sock.sendMessage(groupId,{text:'🔗 *Lien réinitialisé !*\nhttps://chat.whatsapp.com/'+newC+channelFooter()});
      else await sock.sendMessage(groupId,{text:'❌ Impossible de réinitialiser le lien.'});
      break;
    }

    case '!setlink': if(args[0]){config.groupLink=args[0];await sock.sendMessage(groupId,{text:'✅ Lien mis à jour !'+channelFooter()});}break;
    case '!annonce': if(args.join(' ')) await sock.sendMessage(groupId,{text:'📢 *ANNONCE*\n\n'+args.join(' ')+'\n\n🎩 *— Mcamara | Chapeau Noir*'+channelFooter()});break;

    case '!setpp': {
      if (!adm.isBotAdmin) { await sock.sendMessage(groupId,{text:'❌ Bot doit être admin.'}); break; }
      var sppQ = getQuoted(msg);
      if (!sppQ||!sppQ.imageMessage) { await sock.sendMessage(groupId,{text:'❌ Réponds à une image avec !setpp'}); break; }
      try {
        var {downloadContentFromMessage:dlc2} = require('baileys');
        var sppStream = await dlc2(sppQ.imageMessage,'image');
        var sppChunks=[]; for await(var sppC of sppStream) sppChunks.push(sppC);
        await sock.updateProfilePicture(groupId,Buffer.concat(sppChunks));
        await sock.sendMessage(groupId,{text:'✅ *Photo du groupe mise à jour !*'+channelFooter()});
      } catch(e) { await sock.sendMessage(groupId,{text:'❌ Erreur lors du changement de photo.'}); }
      break;
    }

    case '!setdesc': {
      if (!adm.isBotAdmin||!adm.isSenderAdmin) { await sock.sendMessage(groupId,{text:'❌ Admin + bot admin requis.'}); break; }
      var newDesc = args.join(' ');
      if (!newDesc) { await sock.sendMessage(groupId,{text:'❌ Ex: !setdesc Nouveau groupe de hacking éthique'}); break; }
      await sock.groupUpdateDescription(groupId,newDesc).catch(function(){});
      await sock.sendMessage(groupId,{text:'✅ *Description mise à jour !*'+channelFooter()});
      break;
    }

    case '!setname': {
      if (!adm.isBotAdmin||!adm.isSenderAdmin) { await sock.sendMessage(groupId,{text:'❌ Admin + bot admin requis.'}); break; }
      var newName = args.join(' ');
      if (!newName) { await sock.sendMessage(groupId,{text:'❌ Ex: !setname ChapeauNoir Community'}); break; }
      await sock.groupUpdateSubject(groupId,newName).catch(function(){});
      await sock.sendMessage(groupId,{text:'✅ *Nom du groupe mis à jour !*'+channelFooter()});
      break;
    }

    case '!sondage':
    case '!poll': {
      var pollContent = args.join(' ');
      if (!pollContent||!pollContent.includes('|')) {
        await sock.sendMessage(groupId,{text:'❌ *Utilisation:* !sondage Question | Option1 | Option2 | Option3\n\nEx: !sondage Langage préféré ? | Python | JavaScript | Go'+channelFooter()});
        break;
      }
      var pollParts = pollContent.split('|').map(function(p){return p.trim();});
      var pollQ = pollParts[0]; var pollOpts = pollParts.slice(1);
      if (pollOpts.length<2) { await sock.sendMessage(groupId,{text:'❌ Minimum 2 options requises.'}); break; }
      if (pollOpts.length>5) { await sock.sendMessage(groupId,{text:'❌ Maximum 5 options.'}); break; }
      var pollEmojis=['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
      var pollTxt = '📊 *SONDAGE*\n\n*'+pollQ+'*\n\n'+pollOpts.map(function(o,i){return pollEmojis[i]+' '+o;}).join('\n')+'\n\n_Réponds avec le numéro pour voter !_'+channelFooter();
      await sock.sendMessage(groupId,{text:pollTxt});
      break;
    }

    case '!stats': {
      var mems = await memberManager.getAllMembers(); var tot = Object.keys(mems).length;
      var adm2 = Object.values(mems).filter(function(m){return m.isAdmin;}).length;
      await sock.sendMessage(groupId,{text:'╭━━━ *STATS* ━━━\n┃ 👥 Membres: '+tot+'\n┃ ⭐ Admins: '+adm2+'\n┃ 🤖 Bot: '+(botActive?'✅':'🔴')+'\n┃ ⏱️ Uptime: '+formatUptime()+'\n┃ 💾 RAM: '+getRam()+'\n╰━━━━━━━━━━━━━'+channelFooter()});
      break;
    }
    case '!reset': ai.resetConversation(args[0]?args[0]+'@s.whatsapp.net':senderId); await sock.sendMessage(groupId,{text:'🔄 Historique IA réinitialisé.'+channelFooter()}); break;

    case '!pair': {
      var pNum = args[0]?args[0].replace(/[^0-9]/g,''):'';
      if (!pNum||pNum.length<8||pNum.length>15) { await sock.sendMessage(groupId,{text:'❌ *Utilisation:* !pair [numéro]\n📱 Ex: !pair 224661817807'+channelFooter()}); break; }
      var botMod = require('./bot'); var exSess = botMod.getSessions();
      var alrEx = exSess.filter(function(s){return s.phone===pNum;})[0];
      if (alrEx) { await sock.sendMessage(groupId,{text:'⚠️ +'+pNum+' a déjà une session.\n📊 '+(alrEx.isConnected?'✅ Connecté':'⏳ En cours')+channelFooter()}); break; }
      var nSess={id:botMod.getNextId(),phone:pNum,pairingCode:null,isConnected:false,sock:null,status:'starting',retries:0};
      botMod.pushSession(nSess);
      await sock.sendMessage(groupId,{text:'⏳ *Connexion de +'+pNum+'...*'+channelFooter()});
      botMod.startSession(nSess).catch(function(e){nSess.status='error';});
      var pWait=0;
      var pCheck=setInterval(async function(){
        pWait+=1000;
        if(nSess.pairingCode){clearInterval(pCheck);await sock.sendMessage(groupId,{text:'╭━━━ *CODE D\'APPAIRAGE* ━━━\n┃ 🔑 *Code:* '+nSess.pairingCode+'\n┃ 📱 *Numéro:* +'+pNum+'\n┃\n┃ 1️⃣ WhatsApp > Paramètres\n┃ 2️⃣ Appareils connectés\n┃ 3️⃣ Connecter un appareil\n┃ 4️⃣ Entre le code\n┃\n┃ ⏳ Valable ~60 secondes\n╰━━━━━━━━━━━━━'+channelFooter(),contextInfo:{externalAdReply:{title:'🎩 ChapeauNoir — Connexion',body:'by Mcamara',mediaType:1,renderLargerThumbnail:false,sourceUrl:config.channelLink}}});}
        else if(nSess.isConnected){clearInterval(pCheck);await sock.sendMessage(groupId,{text:'✅ *+'+pNum+' connecté !* 🎩'+channelFooter()});}
        else if(pWait>=15000||nSess.status==='error'){clearInterval(pCheck);await sock.sendMessage(groupId,{text:'❌ Impossible de générer le code pour +'+pNum+'. Vérifie le numéro.'+channelFooter()});}
      },1000);
      break;
    }

    default: return false;
  }
  return true;
}

// ════════════════════════════════════════════════════════════
// ─── COMMANDES MEMBRES ──────────────────────────────────────
// ════════════════════════════════════════════════════════════
async function handleMemberCommand(sock, msg, command, args, senderId, groupId) {
  var member = await memberManager.getMember(senderId);
  var memberName = member?(member.name):(msg.pushName||'Membre');
  if (groupId&&groupId.endsWith('@g.us')) incCount(groupId,senderId);

  switch (command) {

    // ══ MENU ══
    case '!menu': case '!aide': case '!help': {
      await sock.sendMessage(groupId, {
        text:
'╭━━━━━━━━━━━━━━━━━━━╮\n'+
'┃   🎩 *CHAPEAU NOIR v'+config.botVersion+'* 🎩   ┃\n'+
'╰━━━━━━━━━━━━━━━━━━━╯\n\n'+
'│ 👤 '+memberName+' │ ⏱️ '+formatUptime()+' │ 💾 '+getRam()+'\n\n'+
'╭━━ 🌐 *GÉNÉRAL* ━━\n'+
'┃ !alive  !ping  !uptime  !lien  !canal\n'+
'┃ !apropos  !regles  !pair\n'+
'╰━━━━━━━━━━━━━━━━━━━\n\n'+
'╭━━ 🔧 *OUTILS* ━━\n'+
'┃ !tts  !traduire  !météo  !news\n'+
'┃ !sticker  !vv  !getpp  !fancy\n'+
'┃ !google  !sondage\n'+
'╰━━━━━━━━━━━━━━━━━━━\n\n'+
'╭━━ 🎮 *DIVERTISSEMENT* ━━\n'+
'┃ !joke  !quote  !fact  !meme  !ship\n'+
'┃ !8ball  !compliment  !insult  !flirt\n'+
'┃ !vérité  !défi  !bonsoir  !simp\n'+
'┃ !wasted  !topmembers\n'+
'╰━━━━━━━━━━━━━━━━━━━\n\n'+
'╭━━ 🎲 *JEUX* ━━\n'+
'┃ !aov          — Action ou Vérité\n'+
'┃ !trivia       — Quiz général\n'+
'┃ !quizhack     — Quiz hacking\n'+
'┃ !pendu        — Le pendu\n'+
'┃ !calcul       — Calcul mental\n'+
'┃ !veritemensonge — Vérité ou mensonge\n'+
'┃ !devinette    — Devinette\n'+
'┃ !kimchoisit   — Qui choisit ?\n'+
'┃ !jackpot      — Machine à sous\n'+
'┃ !rpg          — Mini RPG hacking\n'+
'╰━━━━━━━━━━━━━━━━━━━\n\n'+
'╭━━ 👑 *ADMIN* ━━\n'+
'┃ !on  !off  !ban  !kick  !promote  !demote\n'+
'┃ !mute  !unmute  !tagall  !hidetag\n'+
'┃ !welcome  !goodbye  !antilink  !antispam\n'+
'┃ !antibadword  !antimedia  !antidelete\n'+
'┃ !warn  !warnings  !purge  !resetlink\n'+
'┃ !private  !public  !setpp  !setdesc\n'+
'┃ !setname  !sondage  !annonce  !stats\n'+
'╰━━━━━━━━━━━━━━━━━━━\n\n'+
'> 🎩 *ChapeauNoir* | by *Mcamara*\n'+
'> 📡 '+config.channelLink,
        buttons: makeButtons([
          {id:'!jeux',text:'Jeux',emoji:'🎲'},
          {id:'!fun',text:'Divertissement',emoji:'🎭'},
          {id:'!outils',text:'Outils',emoji:'🔧'},
          {id:'!groupinfo',text:'Groupe',emoji:'👥'}
        ]),
        headerType: 1
      });
      break;
    }

    // ══ GÉNÉRAL ══
    case '!alive': {
      await sock.sendMessage(groupId, {
        text:
'┏━━━━━━━━━━━━━━━━🎩\n'+
'┃❏ `BOT : ChapeauNoir`\n'+
'┣━━━━━━━━━━━━━━━━🎩\n'+
'┃❏ `VERSION : '+config.botVersion+'`\n'+
'┣━━━━━━━━━━━━━━━━🎩\n'+
'┃❏ `STATUT : 🟢 ONLINE`\n'+
'┣━━━━━━━━━━━━━━━━🎩\n'+
'┃❏ `UPTIME : '+formatUptime()+'`\n'+
'┣━━━━━━━━━━━━━━━━🎩\n'+
'┃❏ `RAM : '+getRam()+'`\n'+
'┣━━━━━━━━━━━━━━━━🎩\n'+
'┃❏ `CRÉATEUR : Mcamara`\n'+
'┣━━━━━━━━━━━━━━━━🎩\n'+
'┃❏ `PRÉFIXE : !`\n'+
'┗━━━━━━━━━━━━━━━━🎩',
        contextInfo: { externalAdReply: { title:'🎩 ChapeauNoir — ONLINE', body:'by Mcamara | Hacking Éthique', mediaType:1, renderLargerThumbnail:true, sourceUrl:config.channelLink }}
      });
      break;
    }
    case '!ping': {
      var pS=Date.now(); await sock.sendPresenceUpdate('composing',groupId); var pL=Date.now()-pS;
      await sock.sendMessage(groupId,{text:'╔══ *PONG !* 🏓 ══╗\n\n'+(pL<300?'🟢':pL<700?'🟡':'🔴')+' *Latence:* '+pL+'ms\n⚡ *Qualité:* '+(pL<300?'Excellent':pL<700?'Bon':'Lent')+'\n⏱️ *Uptime:* '+formatUptime()+channelFooter(),buttons:makeButtons([{id:'!ping',text:'Ping encore',emoji:'📡'},{id:'!alive',text:'Statut',emoji:'🤖'}]),headerType:1});
      break;
    }
    case '!uptime':
      await sock.sendMessage(groupId,{text:'╭━ *UPTIME* ━\n┃ 🟢 Actif depuis: *'+formatUptime()+'*\n┃ 📅 Démarré: '+new Date(startTime).toLocaleString('fr-FR')+'\n╰━━━'+channelFooter(),buttons:makeButtons([{id:'!ping',text:'Ping',emoji:'📡'},{id:'!stats',text:'Stats',emoji:'📊'}]),headerType:1});
      break;
    case '!lien':
      await sock.sendMessage(groupId,{text:'🔗 *Lien du groupe*\n\n'+(config.groupLink||'Non configuré — !setlink [url]')+channelFooter()});
      break;
    case '!canal':
      await sock.sendMessage(groupId,{text:'📡 *Chaîne WhatsApp — Chapeau Noir*\n\n'+config.channelLink+'\n\n🎩 Rejoins la chaîne de Mcamara !'+channelFooter(),contextInfo:{externalAdReply:{title:'📡 Chaîne ChapeauNoir',body:'Rejoins la chaîne de Mcamara',mediaType:1,renderLargerThumbnail:false,sourceUrl:config.channelLink}}});
      break;
    case '!regles':
      await sock.sendMessage(groupId,{text:'╭━━ *RÈGLES — CHAPEAU NOIR* ━━\n┃ 1️⃣ Respect mutuel\n┃ 2️⃣ Hacking éthique uniquement\n┃ 3️⃣ Pas de spam\n┃ 4️⃣ Pas de contenu illégal\n┃ 5️⃣ Questions liées à la cybersécurité\n┃ 6️⃣ Partage tes connaissances\n┃ 7️⃣ Admins = dernier mot\n┃ ⚠️ Violation = ban immédiat\n╰━━━━━━━━━━━━━'+channelFooter(),buttons:makeButtons([{id:'!groupinfo',text:'Infos groupe',emoji:'📌'},{id:'!topics',text:'Sujets IA',emoji:'🤖'}]),headerType:1});
      break;
    case '!apropos':
      await sock.sendMessage(groupId,{text:'╭━━ *À PROPOS* ━━\n┃ 🎩 *ChapeauNoir v'+config.botVersion+'*\n┃ 👨‍💻 Créateur: Mcamara\n┃ 🔒 Spécialité: Cybersécurité & CTF\n┃ 📡 '+config.channelLink+'\n╰━━━━━━━━━━━━━'+channelFooter(),contextInfo:{externalAdReply:{title:'🎩 ChapeauNoir Bot',body:'Créé par Mcamara',mediaType:1,renderLargerThumbnail:false,sourceUrl:config.channelLink}}});
      break;
    case '!profil': {
      var hC=ai.getHistoryCount(senderId); var top=getTop(groupId,50);
      var rank=top.findIndex(function(t){return t[0]===senderId;})+1;
      await sock.sendMessage(groupId,{text:'╭━━ *TON PROFIL* ━━\n┃ 📛 Nom: '+memberName+'\n┃ 💬 Messages IA: '+hC+'\n┃ 🏆 Rang: #'+(rank||'?')+'\n┃ 📅 Depuis: '+(member&&member.joinedAt?new Date(member.joinedAt).toLocaleDateString('fr-FR'):'Inconnu')+'\n┃ ⭐ Statut: '+(member&&member.isAdmin?'Admin':'Membre')+'\n╰━━━━━━━━━━━━━'+channelFooter(),buttons:makeButtons([{id:'!reset',text:'Reset IA',emoji:'🔄'},{id:'!topmembers',text:'Classement',emoji:'🏆'}]),headerType:1});
      break;
    }
    case '!topics':
      await sock.sendMessage(groupId,{text:'╭━━ *SUJETS IA* ━━\n┃ 🔓 Ethical Hacking\n┃ 🛡️ Cybersécurité\n┃ 🏴 CTF\n┃ 🌐 Web Hacking (SQLi, XSS...)\n┃ 🔑 Cryptographie\n┃ 📡 Réseau & Protocoles\n┃ 🐧 Kali Linux / Outils\n┃ 🐍 Python sécurité\n┃ 🔍 OSINT\n┃ 💬 Pose ta question directement !\n╰━━━━━━━━━━━━━'+channelFooter(),buttons:makeButtons([{id:'!menu',text:'Menu',emoji:'📋'},{id:'!reset',text:'Reset IA',emoji:'🔄'}]),headerType:1});
      break;
    case '!reset': ai.resetConversation(senderId); await sock.sendMessage(groupId,{text:'🔄 Historique IA réinitialisé !'+channelFooter()}); break;

    // ══ GROUPE ══
    case '!groupinfo': {
      if(!groupId.endsWith('@g.us')){await sock.sendMessage(groupId,{text:'❌ Groupes uniquement.'});break;}
      var gm=await sock.groupMetadata(groupId).catch(function(){return null;});
      if(!gm){await sock.sendMessage(groupId,{text:'❌ Erreur.'});break;}
      var gDesc=gm.desc||'Aucune description.';
      var gTxt='╭━━ *INFOS DU GROUPE* ━━\n┃ 📌 Nom: '+gm.subject+'\n┃ 👥 Membres: '+gm.participants.length+'\n┃ ⭐ Admins: '+gm.participants.filter(function(p){return p.admin;}).length+'\n┃ 👑 Créateur: @'+(gm.owner?gm.owner.split('@')[0]:'?')+'\n┃ 🔒 Mode: '+(groupSettings.get(groupId,'private',false)?'Privé':'Public')+'\n┃ 📝 Desc: '+gDesc.substring(0,80)+(gDesc.length>80?'...':'')+'\n╰━━━━━━━━━━━━━'+channelFooter();
      var gpP=null;try{gpP=await sock.profilePictureUrl(groupId,'image');}catch(e){}
      if(gpP)await sock.sendMessage(groupId,{image:{url:gpP},caption:gTxt,mentions:[gm.owner||'']});
      else await sock.sendMessage(groupId,{text:gTxt,mentions:[gm.owner||'']});
      break;
    }
    case '!getpp': {
      var ppT=getTarget(msg)||senderId;
      try{var ppU=await sock.profilePictureUrl(ppT,'image');await sock.sendMessage(groupId,{image:{url:ppU},caption:'📸 Photo de @'+ppT.split('@')[0]+channelFooter(),mentions:[ppT]});}
      catch(e){await sock.sendMessage(groupId,{text:'❌ Photo privée ou introuvable.'});}
      break;
    }
    case '!vv': {
      var qVV=getQuoted(msg);
      if(!qVV){await sock.sendMessage(groupId,{text:'❌ Réponds à un message view once avec !vv'});break;}
      var vvT=null,vvM=null;
      if(qVV.imageMessage&&qVV.imageMessage.viewOnce){vvT='image';vvM=qVV.imageMessage;}
      else if(qVV.videoMessage&&qVV.videoMessage.viewOnce){vvT='video';vvM=qVV.videoMessage;}
      if(!vvT){await sock.sendMessage(groupId,{text:'❌ Ce message n\'est pas un view once.'});break;}
      try{
        var{downloadContentFromMessage:dlVV}=require('baileys');
        var vvS=await dlVV(vvM,vvT); var vvCh=[];
        for await(var vvC of vvS) vvCh.push(vvC);
        var vvB=Buffer.concat(vvCh);
        if(vvT==='image')await sock.sendMessage(groupId,{image:vvB,caption:'🔓 View once déverrouillé 🎩'});
        else await sock.sendMessage(groupId,{video:vvB,caption:'🔓 View once déverrouillé 🎩'});
      }catch(e){await sock.sendMessage(groupId,{text:'⚠️ Erreur déverrouillage.'});}
      break;
    }
    case '!sticker': {
      var qStk=getQuoted(msg);
      if(!qStk){await sock.sendMessage(groupId,{text:'❌ Réponds à une image avec !sticker'});break;}
      var stkM=qStk.imageMessage||qStk.videoMessage;
      if(!stkM){await sock.sendMessage(groupId,{text:'❌ Ce message ne contient pas d\'image.'});break;}
      try{
        var{downloadContentFromMessage:dlStk}=require('baileys');
        var stkT=qStk.imageMessage?'image':'video';
        var stkS=await dlStk(stkM,stkT); var stkCh=[];
        for await(var stkC of stkS) stkCh.push(stkC);
        await sock.sendMessage(groupId,{sticker:Buffer.concat(stkCh)},{quoted:msg});
      }catch(e){await sock.sendMessage(groupId,{text:'⚠️ Erreur sticker.'});}
      break;
    }
    case '!topmembers': {
      if(!groupId.endsWith('@g.us')){await sock.sendMessage(groupId,{text:'❌ Groupes uniquement.'});break;}
      var topL=getTop(groupId,10);
      if(!topL.length){await sock.sendMessage(groupId,{text:'📊 Pas encore de données. Discutez !'});break;}
      var medals=['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
      var topTxt='╭━━ *🏆 TOP MEMBRES* ━━\n';
      for(var ti=0;ti<topL.length;ti++) topTxt+='┃ '+medals[ti]+' @'+topL[ti][0].split('@')[0]+' — *'+topL[ti][1]+' msgs*\n';
      topTxt+='╰━━━━━━━━━━━━━'+channelFooter();
      await sock.sendMessage(groupId,{text:topTxt,mentions:topL.map(function(t){return t[0];})});
      break;
    }

    // ══ OUTILS ══
    case '!fancy': {
      var fancyTxt=args.join(' ');
      if(!fancyTxt){await sock.sendMessage(groupId,{text:'❌ Ex: !fancy Bonjour\n\nStyles: cursive, bold, italic, flip'});break;}
      var style=fancyTxt.split(' ')[0].toLowerCase();
      var toConv=(['cursive','bold','italic','flip'].includes(style))?fancyTxt.split(' ').slice(1).join(' '):fancyTxt;
      var mapKey=['cursive','bold','italic'].includes(style)?style:null;
      var result;
      if(mapKey) result=toConv.split('').map(function(c){return MAPS[mapKey][c]||c;}).join('');
      else if(style==='flip') result=toConv.split('').map(function(c){var f={'a':'ɐ','b':'q','c':'ɔ','d':'p','e':'ǝ','f':'ɟ','g':'ƃ','h':'ɥ','i':'ᴉ','j':'ɾ','k':'ʞ','l':'l','m':'ɯ','n':'u','o':'o','p':'d','r':'ɹ','s':'s','t':'ʇ','u':'n','v':'ʌ','w':'ʍ','x':'x','y':'ʎ','z':'z','A':'∀','E':'Ǝ','F':'Ⅎ','H':'H','I':'I','L':'˥','M':'W','N':'N','O':'O','S':'S','T':'┴','U':'∩','W':'M','X':'X','Y':'⅄','Z':'Z'};return f[c]||c;}).reverse().join('');
      else result=toConv.split('').map(function(c){return MAPS.cursive[c]||c;}).join('');
      await sock.sendMessage(groupId,{text:'✨ *Fancy Text*\n\n'+result+channelFooter(),buttons:makeButtons([{id:'!fancy bold '+toConv,text:'Bold',emoji:'𝐁'},{id:'!fancy cursive '+toConv,text:'Cursive',emoji:'𝒞'},{id:'!fancy italic '+toConv,text:'Italic',emoji:'𝘐'}]),headerType:1});
      break;
    }
    case '!google': {
      var gQuery=args.join(' ');
      if(!gQuery){await sock.sendMessage(groupId,{text:'❌ Ex: !google comment faire un pentest'});break;}
      await sock.sendPresenceUpdate('composing',groupId);
      try{
        var gData=await fetchJson('https://api.duckduckgo.com/?q='+encodeURIComponent(gQuery)+'&format=json');
        var gRes=gData.AbstractText||(gData.RelatedTopics&&gData.RelatedTopics[0]&&gData.RelatedTopics[0].Text)||'Aucun résultat trouvé.';
        var gUrl=gData.AbstractURL||'https://duckduckgo.com/?q='+encodeURIComponent(gQuery);
        await sock.sendMessage(groupId,{text:'🔍 *Recherche: '+gQuery+'*\n\n'+gRes.substring(0,400)+(gRes.length>400?'...':'')+'\n\n🌐 '+gUrl+channelFooter()});
      }catch(e){await sock.sendMessage(groupId,{text:'❌ Erreur de recherche. Réessaie !'});}
      break;
    }
    case '!tts': {
      var ttsTxt=args.join(' ');
      if(!ttsTxt){await sock.sendMessage(groupId,{text:'❌ Ex: !tts Bonjour je suis ChapeauNoir'});break;}
      await sock.sendPresenceUpdate('composing',groupId);
      try{
        var gTTS=require('gtts'); var ttsFile=path.join(DATA_DIR,'tts_'+Date.now()+'.mp3');
        var gtts=new gTTS(ttsTxt,'fr');
        await new Promise(function(resolve,reject){gtts.save(ttsFile,function(err){if(err)reject(err);else resolve();});});
        await sock.sendMessage(groupId,{audio:{url:ttsFile},mimetype:'audio/mpeg'},{quoted:msg});
        setTimeout(function(){try{fs.unlinkSync(ttsFile);}catch(e){}},5000);
      }catch(e){await sock.sendMessage(groupId,{text:'⚠️ TTS non disponible. Installe: npm install gtts'});}
      break;
    }
    case '!traduire': case '!translate': {
      var trArgs=args; var trLang=trArgs[trArgs.length-1]||'fr'; var trTxt=trArgs.slice(0,-1).join(' ')||args.join(' ');
      if(!args.length){await sock.sendMessage(groupId,{text:'❌ Ex: !traduire Bonjour fr → en\n!traduire Hello en'});break;}
      await sock.sendPresenceUpdate('composing',groupId);
      try{
        var trData=await fetchJson('https://api.mymemory.translated.net/get?q='+encodeURIComponent(trTxt)+'&langpair=auto|'+trLang);
        await sock.sendMessage(groupId,{text:'🌍 *Traduction → '+trLang.toUpperCase()+'*\n\n📝 Original: '+trTxt+'\n✅ Traduit: *'+trData.responseData.translatedText+'*'+channelFooter()});
      }catch(e){await sock.sendMessage(groupId,{text:'❌ Erreur de traduction.'});}
      break;
    }
    case '!météo': case '!weather': {
      var city=args.join(' ');
      if(!city){await sock.sendMessage(groupId,{text:'❌ Ex: !météo Conakry'});break;}
      await sock.sendPresenceUpdate('composing',groupId);
      try{
        var wD=await fetchJson('https://wttr.in/'+encodeURIComponent(city)+'?format=j1');
        var cur=wD.current_condition[0]; var area=wD.nearest_area[0];
        var wTxt='☁️ *Météo — '+area.areaName[0].value+', '+area.country[0].value+'*\n\n🌡️ Temp: *'+cur.temp_C+'°C* (ressenti '+cur.FeelsLikeC+'°C)\n💧 Humidité: '+cur.humidity+'%\n💨 Vent: '+cur.windspeedKmph+' km/h\n☁️ Ciel: '+cur.weatherDesc[0].value;
        await sock.sendMessage(groupId,{text:wTxt+channelFooter(),buttons:makeButtons([{id:'!météo '+city,text:'Actualiser',emoji:'🔄'}]),headerType:1});
      }catch(e){await sock.sendMessage(groupId,{text:'❌ Ville introuvable: '+city});}
      break;
    }
    case '!news': {
      await sock.sendPresenceUpdate('composing',groupId);
      try{
        var nD=await fetchJson('https://saurav.tech/NewsAPI/top-headlines/category/technology/fr.json');
        var arts=(nD.articles||[]).slice(0,5);
        var nTxt='📰 *Dernières actualités Tech*\n\n';
        arts.forEach(function(a,i){nTxt+=(i+1)+'. *'+a.title+'*\n'+(a.description?a.description.substring(0,80)+'...\n':'')+'\n';});
        await sock.sendMessage(groupId,{text:nTxt+channelFooter(),buttons:makeButtons([{id:'!news',text:'Actualiser',emoji:'📰'}]),headerType:1});
      }catch(e){await sock.sendMessage(groupId,{text:'❌ Impossible de charger les actualités.'});}
      break;
    }

    // ══ DIVERTISSEMENT ══
    case '!joke': {
      await sock.sendPresenceUpdate('composing',groupId);
      try{var jD=await fetchJson('https://icanhazdadjoke.com/');await sock.sendMessage(groupId,{text:'😄 *Blague du jour*\n\n'+jD.joke+channelFooter(),buttons:makeButtons([{id:'!joke',text:'Autre blague',emoji:'😄'},{id:'!meme',text:'Meme',emoji:'🎭'}]),headerType:1});}
      catch(e){await sock.sendMessage(groupId,{text:'😄 Pourquoi les plongeurs plongent-ils en arrière ? Parce que sinon ils tomberaient dans le bateau ! 🤿'+channelFooter()});}
      break;
    }
    case '!quote': {
      await sock.sendPresenceUpdate('composing',groupId);
      try{var qD=await fetchJson('https://api.quotable.io/random');await sock.sendMessage(groupId,{text:'💬 *Citation*\n\n_"'+qD.content+'"_\n\n— *'+qD.author+'*'+channelFooter(),buttons:makeButtons([{id:'!quote',text:'Autre citation',emoji:'💬'},{id:'!fact',text:'Fait du jour',emoji:'💡'}]),headerType:1});}
      catch(e){await sock.sendMessage(groupId,{text:'💬 *Citation*\n\n_"La seule façon de faire du bon travail est d\'aimer ce que vous faites."_\n— Steve Jobs'+channelFooter()});}
      break;
    }
    case '!fact': {
      await sock.sendPresenceUpdate('composing',groupId);
      try{var fD=await fetchJson('https://uselessfacts.jsph.pl/random.json?language=fr');await sock.sendMessage(groupId,{text:'💡 *Fait intéressant*\n\n'+fD.text+channelFooter(),buttons:makeButtons([{id:'!fact',text:'Autre fait',emoji:'💡'},{id:'!quote',text:'Citation',emoji:'💬'}]),headerType:1});}
      catch(e){await sock.sendMessage(groupId,{text:'💡 Les pieuvres ont trois cœurs et leur sang est bleu ! 🐙'+channelFooter()});}
      break;
    }
    case '!meme': {
      await sock.sendPresenceUpdate('composing',groupId);
      try{
        var mD=await fetchJson('https://meme-api.com/gimme');
        if(mD&&mD.url){var mBuf=await fetchBuffer(mD.url);await sock.sendMessage(groupId,{image:mBuf,caption:'😂 *'+(mD.title||'Meme')+'*'+channelFooter(),buttons:makeButtons([{id:'!meme',text:'Autre meme',emoji:'😂'},{id:'!joke',text:'Blague',emoji:'😄'}]),headerType:1});}
        else throw new Error('no meme');
      }catch(e){await sock.sendMessage(groupId,{text:'❌ Impossible de charger un meme. Réessaie !'});}
      break;
    }
    case '!ship': {
      if(!groupId.endsWith('@g.us')){await sock.sendMessage(groupId,{text:'❌ Groupes uniquement.'});break;}
      var sMeta=await sock.groupMetadata(groupId).catch(function(){return null;});
      if(!sMeta||sMeta.participants.length<2){await sock.sendMessage(groupId,{text:'❌ Groupe trop petit.'});break;}
      var ps=sMeta.participants.map(function(p){return p.id;}); var u1=rand(ps),u2;
      do{u2=rand(ps);}while(u2===u1);
      await sock.sendMessage(groupId,{text:'💘 *SHIP DU JOUR*\n\n@'+u1.split('@')[0]+' ❤️ @'+u2.split('@')[0]+'\n\nCompatibilité: *'+Math.floor(Math.random()*40+60)+'%* 💯'+channelFooter(),mentions:[u1,u2],buttons:makeButtons([{id:'!ship',text:'Reshiper',emoji:'💘'},{id:'!compliment',text:'Compliment',emoji:'✨'}]),headerType:1});
      break;
    }
    case '!8ball': case '!8': {
      var q8=args.join(' ');
      if(!q8){await sock.sendMessage(groupId,{text:'❓ Ex: !8ball Est-ce que je vais réussir ?'});break;}
      await sock.sendMessage(groupId,{text:'🎱 *Magic 8-Ball*\n\n❓ '+q8+'\n\n💬 *'+rand(EIGHT_BALL)+'*'+channelFooter(),buttons:makeButtons([{id:'!8ball '+q8,text:'Reposer',emoji:'🎱'},{id:'!vérité',text:'Vérité',emoji:'💭'}]),headerType:1});
      break;
    }
    case '!compliment': {var cT=getTarget(msg)||senderId;await sock.sendMessage(groupId,{text:'✨ *Pour @'+cT.split('@')[0]+'*\n\n'+rand(COMPLIMENTS)+channelFooter(),mentions:[cT],buttons:makeButtons([{id:'!compliment',text:'Autre',emoji:'✨'},{id:'!flirt',text:'Flirt',emoji:'💕'}]),headerType:1});break;}
    case '!insult': {var iT=getTarget(msg)||senderId;await sock.sendMessage(groupId,{text:'😈 *Pour @'+iT.split('@')[0]+'*\n\n'+rand(INSULTS_FUN)+'\n\n_(C\'est pour rire 😄)_'+channelFooter(),mentions:[iT],buttons:makeButtons([{id:'!insult',text:'Autre',emoji:'😈'},{id:'!compliment',text:'Pardonner',emoji:'✨'}]),headerType:1});break;}
    case '!flirt': {var flT=getTarget(msg)||senderId;await sock.sendMessage(groupId,{text:'💕 *Pour @'+flT.split('@')[0]+'*\n\n'+rand(FLIRTS)+channelFooter(),mentions:[flT],buttons:makeButtons([{id:'!flirt',text:'Autre flirt',emoji:'💕'},{id:'!ship',text:'Ship',emoji:'💘'}]),headerType:1});break;}
    case '!bonsoir': case '!bonne-nuit': await sock.sendMessage(groupId,{text:'🌙 *BONNE NUIT*\n\n'+rand(GOODNIGHTS)+'\n\n🎩 *— ChapeauNoir*'+channelFooter(),buttons:makeButtons([{id:'!compliment',text:'Compliment',emoji:'✨'},{id:'!quote',text:'Citation',emoji:'💬'}]),headerType:1}); break;
    case '!simp': {
      var simpT=getTarget(msg)||senderId;
      await sock.sendMessage(groupId,{text:'😂 *SIMP ALERT !*\n\n@'+simpT.split('@')[0]+' est officiellement un *SIMP* ! 💀\n\nNiveau simp: *'+Math.floor(Math.random()*50+50)+'%* 😂'+channelFooter(),mentions:[simpT]});
      break;
    }
    case '!wasted': {
      var waT=getTarget(msg)||senderId;
      await sock.sendMessage(groupId,{text:'💀 *WASTED !*\n\n@'+waT.split('@')[0]+'\n\n_GTA V music intensifies..._\n🚑 Ambulance en route...'+channelFooter(),mentions:[waT]});
      break;
    }

    // ══════════════════════════════════════════
    // ══  10 JEUX  ══════════════════════════════
    // ══════════════════════════════════════════

    // JEU 1 ── Action ou Vérité
    case '!aov': {
      var aovSub = args[0]?args[0].toLowerCase():'';
      if (!aovSub||(!['action','vérité','verité','verite'].includes(aovSub))) {
        await sock.sendMessage(groupId, {
          text: '🎭 *ACTION OU VÉRITÉ*\n\nChoisis ton camp 👇'+channelFooter(),
          buttons: makeButtons([
            {id:'!aov vérité', text:'Vérité', emoji:'💭'},
            {id:'!aov action', text:'Action', emoji:'🎯'}
          ]),
          headerType: 1
        });
      } else if (['vérité','verité','verite'].includes(aovSub)) {
        await sock.sendMessage(groupId, {
          text: '💭 *VÉRITÉ*\n\n'+rand(TRUTHS)+channelFooter(),
          buttons: makeButtons([{id:'!aov vérité',text:'Autre vérité',emoji:'💭'},{id:'!aov action',text:'Action plutôt',emoji:'🎯'}]),
          headerType: 1
        });
      } else {
        await sock.sendMessage(groupId, {
          text: '🎯 *ACTION*\n\n'+rand(DARES)+channelFooter(),
          buttons: makeButtons([{id:'!aov action',text:'Autre action',emoji:'🎯'},{id:'!aov vérité',text:'Vérité plutôt',emoji:'💭'}]),
          headerType: 1
        });
      }
      break;
    }

    // JEU 2 ── Quiz général
    case '!trivia': {
      if (triviaGames[groupId]) { await sock.sendMessage(groupId,{text:'⚠️ Une partie est déjà en cours ! Réponds à la question.'}); break; }
      await sock.sendPresenceUpdate('composing',groupId);
      try{
        var tD=await fetchJson('https://opentdb.com/api.php?amount=1&type=multiple');
        var tQ=tD.results[0];
        var tOpts=[...tQ.incorrect_answers,tQ.correct_answer].sort(function(){return Math.random()-0.5;});
        triviaGames[groupId]={question:tQ.question,answer:tQ.correct_answer,options:tOpts,expires:Date.now()+60000};
        setTimeout(function(){if(triviaGames[groupId])delete triviaGames[groupId];},61000);
        var tLetters=['A','B','C','D'];
        var tTxt='🧠 *TRIVIA*\n\n❓ '+tQ.question.replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&')+'\n\n'+tOpts.map(function(o,i){return tLetters[i]+'. '+o.replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&');}).join('\n')+'\n\n💬 Réponds avec *!rep A* (ou B, C, D)'+channelFooter();
        await sock.sendMessage(groupId,{text:tTxt});
      }catch(e){await sock.sendMessage(groupId,{text:'❌ Impossible de charger une question. Réessaie !'});}
      break;
    }

    // JEU 3 ── Quiz hacking
    case '!quizhack': {
      if (quizHackGames[groupId]) { await sock.sendMessage(groupId,{text:'⚠️ Une partie est déjà en cours ! Réponds avec *!reph [réponse]*'}); break; }
      var qhQ=rand(QUIZ_HACK);
      var qhOpts=[...qhQ.opts].sort(function(){return Math.random()-0.5;});
      quizHackGames[groupId]={answer:qhQ.a,options:qhOpts,expires:Date.now()+60000};
      setTimeout(function(){if(quizHackGames[groupId]){sock.sendMessage(groupId,{text:'⏰ Temps écoulé ! La réponse était: *'+qhQ.a+'*'+channelFooter()});delete quizHackGames[groupId];}},61000);
      var qhLetters=['A','B','C','D'];
      await sock.sendMessage(groupId,{
        text:'🔒 *QUIZ HACKING*\n\n❓ '+qhQ.q+'\n\n'+qhOpts.map(function(o,i){return qhLetters[i]+'. '+o;}).join('\n')+'\n\n💬 Réponds avec *!reph A* (ou B, C, D)\n⏳ 60 secondes !'+channelFooter(),
        buttons:makeButtons(qhOpts.slice(0,3).map(function(o,i){return{id:'!reph '+qhLetters[i],text:qhLetters[i]+'. '+o.substring(0,20),emoji:'🔒'};})),
        headerType:1
      });
      break;
    }

    // Réponse quiz hacking
    case '!reph': {
      var rephGame = quizHackGames[groupId];
      if (!rephGame) { await sock.sendMessage(groupId,{text:'❌ Pas de quiz en cours. Lance avec !quizhack'}); break; }
      var rephInput = args.join(' ').toLowerCase().trim();
      var rephLetter = rephInput.toUpperCase();
      var rephLetters2=['A','B','C','D'];
      var rephAnswer = null;
      if (rephLetters2.includes(rephLetter)) rephAnswer = rephGame.options[rephLetters2.indexOf(rephLetter)];
      else rephAnswer = rephInput;
      if (rephAnswer===rephGame.answer||rephLetter===rephGame.answer) {
        delete quizHackGames[groupId];
        await sock.sendMessage(groupId,{text:'🎉 *BONNE RÉPONSE !*\n\n✅ *'+rephGame.answer+'*\n\nBravo @'+senderId.split('@')[0]+' ! 🏆'+channelFooter(),mentions:[senderId]});
      } else {
        await sock.sendMessage(groupId,{text:'❌ *Mauvaise réponse !*\n\nRéponse donnée: '+rephAnswer+'\nEssaie encore !'+channelFooter(),mentions:[senderId]});
      }
      break;
    }

    // Réponse trivia générale
    case '!rep': {
      var repGame = triviaGames[groupId];
      if (!repGame) { await sock.sendMessage(groupId,{text:'❌ Pas de trivia en cours. Lance avec !trivia'}); break; }
      var repL = (args[0]||'').toUpperCase();
      var repLetters=['A','B','C','D'];
      if (!repLetters.includes(repL)) { await sock.sendMessage(groupId,{text:'❌ Réponds avec A, B, C ou D'}); break; }
      var repGuess = repGame.options[repLetters.indexOf(repL)];
      if (repGuess===repGame.answer) {
        delete triviaGames[groupId];
        await sock.sendMessage(groupId,{text:'🎉 *BONNE RÉPONSE !*\n\n✅ *'+repGame.answer+'*\n\nBravo @'+senderId.split('@')[0]+' ! 🏆'+channelFooter(),mentions:[senderId]});
      } else {
        await sock.sendMessage(groupId,{text:'❌ *Mauvaise réponse !*\n\nTu as dit: '+repL+' ('+repGuess+')\nEssaie encore !',mentions:[senderId]});
      }
      break;
    }

    // JEU 4 ── Le pendu
    case '!pendu': {
      if (hangmanGames[groupId]) { await sock.sendMessage(groupId,{text:'⚠️ Partie en cours ! Devine avec *!lettre X*'}); break; }
      var hwds=['javascript','cybersecurite','hacking','kalilinux','python','reseau','cryptographie','osint','firewall','malware','phishing','exploit','payload','forensic','pentesting'];
      var hw=rand(hwds);
      hangmanGames[groupId]={word:hw,guessed:[],wrong:0,max:6};
      var hmask=hw.split('').map(function(){return '_';}).join(' ');
      await sock.sendMessage(groupId,{text:'🎮 *PENDU*\n\n😊 Essais restants: 6/6\n📝 Mot: '+hmask+'\n\n💬 Devine avec *!lettre X*'+channelFooter()});
      break;
    }
    case '!lettre': {
      if (!hangmanGames[groupId]) { await sock.sendMessage(groupId,{text:'❌ Pas de partie. Lance avec !pendu'}); break; }
      var hLet=(args[0]||'').toLowerCase().charAt(0);
      if(!hLet||!/[a-z]/.test(hLet)){await sock.sendMessage(groupId,{text:'❌ Entre une lettre. Ex: !lettre a'});break;}
      var hG=hangmanGames[groupId];
      if(hG.guessed.includes(hLet)){await sock.sendMessage(groupId,{text:'⚠️ Lettre déjà essayée !'});break;}
      hG.guessed.push(hLet);
      var ok=hG.word.includes(hLet);
      if(!ok)hG.wrong++;
      var hMask=hG.word.split('').map(function(c){return hG.guessed.includes(c)?c:'_';}).join(' ');
      var hPics=['😊','🙂','😐','😟','😰','😱','💀'];
      var hDone=!hMask.includes('_')||hG.wrong>=hG.max;
      var hMsg=(ok?'✅':'❌')+' Lettre *'+hLet+'* '+(ok?'trouvée !':'ratée !')+'\n\n'+hPics[hG.wrong]+' Erreurs: '+hG.wrong+'/'+hG.max+'\n📝 Mot: '+hMask+'\n🔤 Essayées: '+hG.guessed.join(', ');
      if(hDone){if(!hMask.includes('_'))hMsg+='\n\n🎉 *Bravo ! Mot trouvé: '+hG.word+'* 🏆';else hMsg+='\n\n💀 *Perdu ! Le mot était: '+hG.word+'*';delete hangmanGames[groupId];}
      await sock.sendMessage(groupId,{text:hMsg+channelFooter()});
      break;
    }

    // JEU 5 ── Calcul mental
    case '!calcul': {
      if (mathGames[groupId]) { await sock.sendMessage(groupId,{text:'⚠️ Calcul en cours ! Réponds avec *!calc [réponse]*'}); break; }
      var mathQ=genMath();
      mathGames[groupId]={answer:mathQ.answer,expires:Date.now()+30000};
      setTimeout(function(){if(mathGames[groupId]){sock.sendMessage(groupId,{text:'⏰ Temps écoulé ! La réponse était: *'+mathQ.answer+'*'+channelFooter()});delete mathGames[groupId];}},31000);
      await sock.sendMessage(groupId,{text:'🧮 *CALCUL MENTAL*\n\n❓ Combien font *'+mathQ.question+'*\n\n💬 Réponds avec *!calc [réponse]*\n⏳ 30 secondes !'+channelFooter()});
      break;
    }
    case '!calc': {
      if (!mathGames[groupId]) { await sock.sendMessage(groupId,{text:'❌ Pas de calcul en cours. Lance avec !calcul'}); break; }
      var calcAns=parseInt(args[0]);
      if(isNaN(calcAns)){await sock.sendMessage(groupId,{text:'❌ Entre un nombre. Ex: !calc 42'});break;}
      if(calcAns===mathGames[groupId].answer){delete mathGames[groupId];await sock.sendMessage(groupId,{text:'🎉 *CORRECT !* ✅\n\nBravo @'+senderId.split('@')[0]+' ! Tu as trouvé *'+calcAns+'* 🏆'+channelFooter(),mentions:[senderId]});}
      else await sock.sendMessage(groupId,{text:'❌ Mauvais ! Tu as dit *'+calcAns+'*. Essaie encore !',mentions:[senderId]});
      break;
    }

    // JEU 6 ── Vérité ou Mensonge
    case '!veritemensonge': case '!vm': {
      var vmFacts=[
        {statement:'Un hacker éthique s\'appelle un "White Hat".',truth:true},
        {statement:'Le protocole HTTP chiffre les données.',truth:false},
        {statement:'Nmap est un outil de scan de ports.',truth:true},
        {statement:'Un VPN rend l\'utilisateur totalement anonyme.',truth:false},
        {statement:'SQL injection existe depuis les années 90.',truth:true},
        {statement:'Kali Linux a été créé par l\'équipe d\'Offensive Security.',truth:true},
        {statement:'Le protocole SSH utilise le port 22 par défaut.',truth:true},
        {statement:'Un firewall bloque toutes les cyberattaques.',truth:false},
        {statement:'Metasploit est uniquement utilisé par des hackers illégaux.',truth:false},
        {statement:'Le phishing est une attaque sociale.',truth:true}
      ];
      var vmQ=rand(vmFacts);
      await sock.sendMessage(groupId, {
        text: '🎯 *VÉRITÉ OU MENSONGE*\n\n📌 *'+vmQ.statement+'*\n\nVrai ou Faux ?'+channelFooter(),
        buttons: makeButtons([
          {id:'!vmrep vrai '+vmQ.truth, text:'✅ Vrai', emoji:'✅'},
          {id:'!vmrep faux '+vmQ.truth, text:'❌ Faux', emoji:'❌'}
        ]),
        headerType: 1
      });
      break;
    }
    case '!vmrep': {
      var vmChoice=(args[0]||'').toLowerCase();
      var vmCorrect=args[1]==='true';
      var vmRight=(vmChoice==='vrai'&&vmCorrect)||(vmChoice==='faux'&&!vmCorrect);
      await sock.sendMessage(groupId,{text:(vmRight?'🎉 *CORRECT !* ✅\n\nBravo @'+senderId.split('@')[0]+' !':'❌ *RATÉ !*\n\nC\'était '+(vmCorrect?'VRAI ✅':'FAUX ❌'))+channelFooter(),mentions:[senderId],buttons:makeButtons([{id:'!veritemensonge',text:'Rejouer',emoji:'🎯'}]),headerType:1});
      break;
    }

    // JEU 7 ── Devinette
    case '!devinette': {
      var devinettes=[
        {q:'Je suis invisible mais protège ton réseau. Qui suis-je ?',r:'firewall'},
        {q:'Je scanne les ports sans faire de bruit. Qui suis-je ?',r:'nmap'},
        {q:'Je suis une attaque qui te fait cliquer sur un faux site. Qui suis-je ?',r:'phishing'},
        {q:'Je chiffre tes données mais les hackers veulent la clé. Qui suis-je ?',r:'cryptographie'},
        {q:'Je suis une distribution Linux préférée des hackers. Qui suis-je ?',r:'kali linux'},
        {q:'Je suis un code malveillant qui se cache dans tes fichiers. Qui suis-je ?',r:'virus'},
        {q:'Je suis une vulnérabilité dans les formulaires web. Qui suis-je ?',r:'xss'},
        {q:'Je permets d\'accéder à distance à une machine. Qui suis-je ?',r:'ssh'}
      ];
      var dev=rand(devinettes);
      await sock.sendMessage(groupId,{text:'🤔 *DEVINETTE*\n\n'+dev.q+'\n\n💬 Réponds avec *!devRep [réponse]*'+channelFooter()});
      if(!hangmanGames['dev_'+groupId]) hangmanGames['dev_'+groupId]={answer:dev.r,expires:Date.now()+60000};
      setTimeout(function(){if(hangmanGames['dev_'+groupId]){sock.sendMessage(groupId,{text:'⏰ La réponse était: *'+dev.r+'*'+channelFooter()});delete hangmanGames['dev_'+groupId];}},61000);
      break;
    }
    case '!devrep': {
      var devG=hangmanGames['dev_'+groupId];
      if(!devG){await sock.sendMessage(groupId,{text:'❌ Pas de devinette en cours. Lance avec !devinette'});break;}
      var devAns=args.join(' ').toLowerCase().trim();
      if(devAns===devG.answer||devG.answer.includes(devAns)){delete hangmanGames['dev_'+groupId];await sock.sendMessage(groupId,{text:'🎉 *BONNE RÉPONSE !*\n\n✅ *'+devG.answer+'*\n\nBravo @'+senderId.split('@')[0]+' ! 🏆'+channelFooter(),mentions:[senderId]});}
      else await sock.sendMessage(groupId,{text:'❌ Mauvais ! Essaie encore !',mentions:[senderId]});
      break;
    }

    // JEU 8 ── Qui choisit ?
    case '!kimchoisit': case '!whochooses': {
      if(!groupId.endsWith('@g.us')){await sock.sendMessage(groupId,{text:'❌ Groupes uniquement.'});break;}
      var kcMeta=await sock.groupMetadata(groupId).catch(function(){return null;});
      if(!kcMeta||kcMeta.participants.length<2){await sock.sendMessage(groupId,{text:'❌ Groupe trop petit.'});break;}
      var kcPart=kcMeta.participants.map(function(p){return p.id;});
      var kcChosen=rand(kcPart);
      var kcTask=rand(DARES);
      await sock.sendMessage(groupId,{
        text:'🎲 *QUI CHOISIT ?*\n\n🎯 Le sort a désigné : @'+kcChosen.split('@')[0]+' !\n\n📋 *Ta mission:*\n'+kcTask+channelFooter(),
        mentions:[kcChosen],
        buttons:makeButtons([{id:'!kimchoisit',text:'Choisir encore',emoji:'🎲'},{id:'!aov action',text:'Autre défi',emoji:'🎯'}]),
        headerType:1
      });
      break;
    }

    // JEU 9 ── Machine à sous (Jackpot)
    case '!jackpot': {
      var slots=['🍒','🍊','🍋','🍇','⭐','💎','🎰','7️⃣'];
      var s1=rand(slots),s2=rand(slots),s3=rand(slots);
      var isJackpot=s1===s2&&s2===s3;
      var is2=s1===s2||s2===s3||s1===s3;
      var msg2=isJackpot?'🎉 *JACKPOT ! TU AS TOUT GAGNÉ !* 🎉':is2?'✨ *Deux identiques ! Presque...* ✨':'❌ *Rien... Retente ta chance !*';
      await sock.sendMessage(groupId,{
        text:'🎰 *MACHINE À SOUS*\n\n┌─────────────┐\n│ '+s1+'  '+s2+'  '+s3+' │\n└─────────────┘\n\n'+msg2+channelFooter(),
        buttons:makeButtons([{id:'!jackpot',text:'Rejouer',emoji:'🎰'}]),
        headerType:1
      });
      break;
    }

    // JEU 10 ── Mini RPG Hacking
    case '!rpg': {
      var rpgScenarios=[
        {scenario:'🖥️ Tu découvres une vulnérabilité sur un serveur. Que fais-tu ?',choices:[{a:'Tu l\'exploites pour voler des données 💀',r:'❌ C\'est illégal ! Tu es arrêté par la cyberpolicer. GAME OVER.'},{ a:'Tu contactes l\'équipe de sécurité (Bug Bounty) 🏆',r:'✅ Tu reçois une récompense de 5000$ et une offre d\'emploi !'},{ a:'Tu ignores 😴',r:'⚠️ Le hacker du groupe adverse exploite la faille avant toi...'}]},
        {scenario:'🔓 Tu trouves des credentials exposés sur GitHub. Que fais-tu ?',choices:[{a:'Tu essaies de te connecter 🚫',r:'❌ Accès non autorisé = prison. GAME OVER.'},{a:'Tu notifies le développeur via email 📧',r:'✅ Le développeur te remercie et t\'offre un accès premium gratuit !'},{a:'Tu fais un screenshot et passes à autre chose 📸',r:'⚠️ Tu aurais pu aider quelqu\'un...'}]},
        {scenario:'🌐 Tu dois pénétrer un système lors d\'un CTF. Par où commences-tu ?',choices:[{a:'!nmap -sV target.com 🔍',r:'✅ Excellent ! Tu trouves des ports ouverts. Continue avec Metasploit !'},{a:'Tu attaques directement sans scanner 🏃',r:'❌ Tu déclenches le WAF. Connexion bloquée !'},{a:'Tu cherches sur Google les vulnérabilités connues 🔎',r:'✅ Bonne approche OSINT ! Tu trouves un CVE récent !'}]}
      ];
      var rpgS=rand(rpgScenarios);
      var rpgChoices=rpgS.choices;
      await sock.sendMessage(groupId,{
        text:'⚔️ *MINI RPG — HACKING*\n\n'+rpgS.scenario+'\n\n'+rpgChoices.map(function(c,i){return (i+1)+'. '+c.a;}).join('\n')+'\n\n💬 Réponds avec *!rpgrep 1*, *!rpgrep 2* ou *!rpgrep 3*'+channelFooter(),
        buttons:makeButtons([{id:'!rpgrep 1',text:'Option 1',emoji:'1️⃣'},{id:'!rpgrep 2',text:'Option 2',emoji:'2️⃣'},{id:'!rpgrep 3',text:'Option 3',emoji:'3️⃣'}]),
        headerType:1
      });
      if(!hangmanGames['rpg_'+groupId]) hangmanGames['rpg_'+groupId]={choices:rpgChoices,expires:Date.now()+60000};
      break;
    }
    case '!rpgrep': {
      var rpgG=hangmanGames['rpg_'+groupId];
      if(!rpgG){await sock.sendMessage(groupId,{text:'❌ Pas de RPG en cours. Lance avec !rpg'});break;}
      var rpgN=parseInt(args[0])-1;
      if(isNaN(rpgN)||rpgN<0||rpgN>=rpgG.choices.length){await sock.sendMessage(groupId,{text:'❌ Choisis 1, 2 ou 3'});break;}
      var rpgResult=rpgG.choices[rpgN].r;
      delete hangmanGames['rpg_'+groupId];
      await sock.sendMessage(groupId,{
        text:'⚔️ *RÉSULTAT*\n\n'+rpgResult+channelFooter(),
        buttons:makeButtons([{id:'!rpg',text:'Nouvelle partie',emoji:'⚔️'},{id:'!quizhack',text:'Quiz Hacking',emoji:'🔒'}]),
        headerType:1
      });
      break;
    }

    // ══ MENUS RAPIDES ══
    case '!jeux': {
      await sock.sendMessage(groupId, {
        text: '🎲 *MENU JEUX*\n\nChoisis un jeu 👇'+channelFooter(),
        buttons: makeButtons([
          {id:'!aov',text:'Action ou Vérité',emoji:'🎭'},
          {id:'!trivia',text:'Trivia',emoji:'🧠'},
          {id:'!quizhack',text:'Quiz Hacking',emoji:'🔒'},
          {id:'!jackpot',text:'Jackpot',emoji:'🎰'}
        ]),
        headerType: 1
      });
      break;
    }
    case '!fun': {
      await sock.sendMessage(groupId, {
        text: '🎮 *MENU DIVERTISSEMENT*\n\nChoisis 👇'+channelFooter(),
        buttons: makeButtons([
          {id:'!joke',text:'Blague',emoji:'😄'},
          {id:'!meme',text:'Meme',emoji:'🎭'},
          {id:'!ship',text:'Ship',emoji:'💘'},
          {id:'!8ball Ça va bien ?',text:'Magic 8-Ball',emoji:'🎱'}
        ]),
        headerType: 1
      });
      break;
    }
    case '!outils': {
      await sock.sendMessage(groupId, {
        text: '🔧 *MENU OUTILS*\n\nChoisis 👇'+channelFooter(),
        buttons: makeButtons([
          {id:'!météo Conakry',text:'Météo',emoji:'☁️'},
          {id:'!news',text:'Actualités',emoji:'📰'},
          {id:'!google cybersecurité',text:'Recherche',emoji:'🔍'},
          {id:'!fancy bold ChapeauNoir',text:'Fancy Text',emoji:'✨'}
        ]),
        headerType: 1
      });
      break;
    }

    default: return false;
  }
  return true;
}

// ─── Welcome / Goodbye ────────────────────────────────────────
async function handleGroupParticipantUpdate(sock, update) {
  var groupId=update.id, participants=update.participants, action=update.action;
  if (action==='add'&&groupSettings.get(groupId,'welcome',false)) {
    for (var i=0;i<participants.length;i++) {
      var nm=participants[i];
      var gm=await sock.groupMetadata(groupId).catch(function(){return null;});
      var gpP=null;try{gpP=await sock.profilePictureUrl(groupId,'image');}catch(e){}
      var wCap='╭━━━ *BIENVENUE* ━━━\n┃ 👋 *Bienvenue @'+nm.split('@')[0]+' !*\n┃ 📌 '+(gm?gm.subject:'?')+'\n┃ 👥 Membres: '+(gm?gm.participants.length:'?')+'\n┃ 📖 Tape *!menu* pour les commandes\n╰━━━━━━━━━━━━━'+channelFooter();
      if(gpP)await sock.sendMessage(groupId,{image:{url:gpP},caption:wCap,mentions:[nm]});
      else await sock.sendMessage(groupId,{text:wCap,mentions:[nm]});
    }
  }
  if (action==='remove'&&groupSettings.get(groupId,'goodbye',false)) {
    for (var j=0;j<participants.length;j++) {
      var lm=participants[j];
      var gm2=await sock.groupMetadata(groupId).catch(function(){return null;});
      await sock.sendMessage(groupId,{text:'╭━━━ *AU REVOIR* ━━━\n┃ 👋 @'+lm.split('@')[0]+' a quitté le groupe.\n┃ 👥 Membres restants: '+(gm2?gm2.participants.length:'?')+'\n╰━━━━━━━━━━━━━'+channelFooter(),mentions:[lm]});
    }
  }
}

// ─── Anti-link ────────────────────────────────────────────────
async function checkAntiLink(sock, msg, groupId, senderId, isAdmin) {
  if (isAdmin||!groupSettings.get(groupId,'antilink',false)) return false;
  var txt=(msg.message&&(msg.message.conversation||(msg.message.extendedTextMessage&&msg.message.extendedTextMessage.text)))||'';
  if (!/(https?:\/\/|www\.|chat\.whatsapp\.com)/i.test(txt)) return false;
  await sock.sendMessage(groupId,{text:'🔗 ⚠️ @'+senderId.split('@')[0]+' Les liens sont interdits !',mentions:[senderId]});
  try{await sock.groupParticipantsUpdate(groupId,[senderId],'remove');}catch(e){}
  return true;
}

// ─── Anti-badword ─────────────────────────────────────────────
async function checkAntiBadWord(sock, msg, groupId, senderId, isAdmin) {
  if (isAdmin||!groupSettings.get(groupId,'antibadword',false)) return false;
  var txt=(msg.message&&(msg.message.conversation||(msg.message.extendedTextMessage&&msg.message.extendedTextMessage.text)))||'';
  if (!txt) return false;
  var bwList=loadJson('badwords.json',[]);
  var found=bwList.find(function(w){return txt.toLowerCase().includes(w);});
  if (!found) return false;
  await sock.sendMessage(groupId,{text:'🤬 ⚠️ @'+senderId.split('@')[0]+' Mot interdit ! Avertissement.',mentions:[senderId]});
  return true;
}

// ─── Anti-media ───────────────────────────────────────────────
async function checkAntiMedia(sock, msg, groupId, senderId, isAdmin) {
  if (isAdmin||!groupSettings.get(groupId,'antimedia',false)) return false;
  var hasMedia=msg.message&&(msg.message.imageMessage||msg.message.videoMessage||msg.message.audioMessage||msg.message.documentMessage);
  if (!hasMedia) return false;
  await sock.sendMessage(groupId,{text:'🖼️ ⚠️ @'+senderId.split('@')[0]+' Médias interdits dans ce groupe !',mentions:[senderId]});
  return true;
}

module.exports = {
  handleAdminCommand,
  handleMemberCommand,
  handleGroupParticipantUpdate,
  checkAntiLink,
  checkAntiBadWord,
  checkAntiMedia,
  isBotActive,
  setBotActive,
};
