const IP='Eddydev.ddns.net';
const DISCORD_API='https://eddy-bot-lyvo.onrender.com/api/discord';

const translations={
  en:{
    navServer:'Server',navDiscord:'Discord',navContact:'Contact',lang:'עברית',
    badge:'MINECRAFT COMMUNITY',heroTitle:'Welcome to <span>EddyWEB</span>',
    heroText:'The home of our Minecraft community. Join, play, and become part of the community.',
    copy:'Copy IP',copied:'✓ IP copied!',join:'Join Server',statusTitle:'Server Status',
    checking:'Checking...',discordChecking:'Checking member count...',staffChecking:'Checking available staff...',
    discordTitle:'Discord',joinDiscord:'Join Server →',voteTitle:'Vote',
    voteText:'A voting link will be added here soon.',contactTitle:'Contact',
    contactText:'Have a question or problem? Contact us through Discord.',contactBtn:'Contact Us →',
    footer:'Minecraft community • Eddydev.ddns.net',players:(a,b)=>`${a} / ${b} players online`,
    unavailable:'Server is currently unavailable',cannot:'Unable to check',failed:'Status check failed',
    members:n=>`${n.toLocaleString('en-US')} members`,staff:'Available staff:',team:'Team',developers:'Developers',helpers:'Helpers',moderators:'Moderators',
    available:(o,t)=>`${o} / ${t} available`,staffFail:'Unable to check staff availability'
  },
  he:{
    navServer:'השרת',navDiscord:'Discord',navContact:'צור קשר',lang:'English',
    badge:'קהילת MINECRAFT',heroTitle:'ברוכים הבאים ל־<span>EddyWEB</span>',
    heroText:'הבית של קהילת Minecraft שלנו. היכנסו, שחקו והצטרפו לקהילה.',
    copy:'העתק IP',copied:'✓ ה־IP הועתק!',join:'כניסה לשרת',statusTitle:'סטטוס השרת',
    checking:'בודק...',discordChecking:'בודק מספר חברים...',staffChecking:'בודק צוות זמין...',
    discordTitle:'Discord',joinDiscord:'הצטרף לשרת →',voteTitle:'Vote',
    voteText:'קישור להצבעה יתווסף כאן ברגע שתשלח אותו.',contactTitle:'צור קשר',
    contactText:'יש שאלה או בעיה? פנו אלינו דרך Discord.',contactBtn:'צור קשר →',
    footer:'קהילת Minecraft • Eddydev.ddns.net',players:(a,b)=>`${a} / ${b} שחקנים מחוברים`,
    unavailable:'השרת כרגע לא זמין',cannot:'לא ניתן לבדוק',failed:'בדיקת הסטטוס נכשלה',
    members:n=>`${n.toLocaleString('he-IL')} חברים`,staff:'אנשי צוות זמינים:',team:'צוות',developers:'מתכנתים',helpers:'הלפרים',moderators:'Moderators',
    available:(o,t)=>`${o} / ${t} זמינים`,staffFail:'לא ניתן לבדוק זמינות צוות'
  }
};

let language=localStorage.getItem('eddy-language')||'en';
function t(){return translations[language]}
function applyLanguage(){
  const x=t(); document.documentElement.lang=language; document.documentElement.dir=language==='he'?'rtl':'ltr';
  const nav=document.querySelectorAll('nav a'); nav[0].textContent=x.navServer; nav[2].textContent=x.navContact;
  document.getElementById('lang-toggle').textContent=x.lang;
  document.querySelector('.badge').lastChild.textContent=x.badge;
  document.querySelector('.hero h1').innerHTML=x.heroTitle; document.querySelector('.hero p').textContent=x.heroText;
  document.querySelector('.ip button').textContent=x.copy; document.querySelector('.btn.primary').textContent=x.join;
  document.querySelector('#server h2').textContent=x.statusTitle; document.querySelector('#community h2').textContent=x.discordTitle;
  document.querySelector('#community .textbtn').textContent=x.joinDiscord; document.querySelector('#vote h2').textContent=x.voteTitle;
  document.querySelector('#vote p').textContent=x.voteText; document.querySelector('#contact h2').textContent=x.contactTitle;
  document.querySelector('#contact p').textContent=x.contactText; document.querySelector('#contact .textbtn').textContent=x.contactBtn;
  document.querySelector('footer p').textContent=x.footer;
  document.getElementById('status').textContent=x.checking; document.getElementById('discord-members').textContent=x.discordChecking;
  document.getElementById('discord-staff').innerHTML='<span>'+x.staffChecking+'</span>';
}
function toggleLanguage(){language=language==='en'?'he':'en';localStorage.setItem('eddy-language',language);applyLanguage();status();discordStats()}
async function copyIP(){try{await navigator.clipboard.writeText(IP);document.getElementById('copied').textContent=t().copied;setTimeout(()=>document.getElementById('copied').textContent='',1800)}catch(e){}}
async function status(){const s=document.getElementById('status'),p=document.getElementById('players'),x=t();try{const r=await fetch('https://api.mcsrvstat.us/3/'+IP);const d=await r.json();if(d.online){s.textContent='Online';s.style.color='#4fffdc';p.textContent=x.players(d.players?.online??0,d.players?.max??0)}else{s.textContent='Offline';s.style.color='#ff6b8a';p.textContent=x.unavailable}}catch(e){s.textContent=x.cannot;p.textContent=x.failed}}
async function discordStats(){const p=document.getElementById('discord-members'),staff=document.getElementById('discord-staff'),x=t();if(!p)return;try{const r=await fetch(DISCORD_API,{cache:'no-store'}),d=await r.json();if(!d.ok)throw new Error();p.textContent=x.members(Number(d.members));p.style.color='#b965ff';const labels={team:x.team,developers:x.developers,helpers:x.helpers,moderators:x.moderators};staff.innerHTML='<div class="staff-title">'+x.staff+' <strong>'+(d.staff?.totalAvailable??0)+'</strong></div>'+Object.entries(labels).map(([key,label])=>{const a=d.staff?.roles?.[key]||{online:0,total:0};return '<div class="staff-row"><span>'+label+'</span><span><b>'+a.online+'</b> / '+a.total+' '+(language==='en'?'available':'זמינים')+'</span></div>'}).join('')}catch(e){p.textContent=language==='en'?'Unavailable':'לא זמין';if(staff)staff.innerHTML='<span>'+x.staffFail+'</span>'}}
applyLanguage();status();discordStats();setInterval(status,30000);setInterval(discordStats,60000);