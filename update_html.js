const fs = require('fs');

const htmlFile = 'C:\\Users\\Gueladio\\Documents\\pages\\Nouveau\\streaming.html';
let html = fs.readFileSync(htmlFile, 'utf8');

const match = html.match(/const channels = \[([\s\S]*?)\];/);
if (!match) { console.error("Cannot find channels array!"); process.exit(1); }

const channelRegex = /\{\s*id:\s*(\d+),\s*name:\s*"((?:[^"\\]|\\.)*)"\s*,\s*url:\s*"([^"]+)"\s*,\s*type:\s*"([^"]+)"\s*\}/g;

let channels = [];
let m;
while ((m = channelRegex.exec(match[1])) !== null) {
    channels.push({ id: parseInt(m[1]), name: m[2], url: m[3], type: m[4] });
}

console.log(`Found ${channels.length} channels before cleanup.`);

// 6. Remove known CORS-blocked domains (like jmp2.uk proxy which blocks browsers)
const corsBlockedDomains = [
    'jmp2.uk'
];

channels = channels.filter(ch => {
    const blocked = corsBlockedDomains.some(domain => ch.url.includes(domain));
    if (blocked) console.log(`❌ Removing CORS-blocked domain: ${ch.name}`);
    return !blocked;
});

// 5. Renumber IDs
channels = channels.map((ch, i) => ({ ...ch, id: i + 1 }));

console.log(`\n✅ ${channels.length} clean channels remaining.`);

// Build the new array string
let arrayStr = 'const channels = [\n';
channels.forEach((ch, i) => {
    const safeName = ch.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const comma = i < channels.length - 1 ? ',' : '';
    arrayStr += `            { id: ${ch.id}, name: "${safeName}", url: "${ch.url}", type: "${ch.type}" }${comma}\n`;
});
arrayStr += '        ];';

const newHtml = html.replace(/const channels = \[[\s\S]*?\];/, arrayStr);
fs.writeFileSync(htmlFile, newHtml);
console.log(`\n✅ streaming.html updated successfully!`);
