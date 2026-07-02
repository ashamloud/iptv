const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/const channels = \[([\s\S]*?)\];/);
if (match) {
    const str = '[\n' + match[1] + '\n]';
    try {
        const parsed = eval(str);
        fs.writeFileSync('channels.json', JSON.stringify(parsed, null, 2));
        console.log('Extracted ' + parsed.length + ' channels to channels.json');
    } catch(e) {
        console.error('Failed to parse', e);
    }
}
