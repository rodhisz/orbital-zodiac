const fs = require('fs');

const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

// The replacement logic
content = content.replace(/nodesParam\.forEach\(n => {\n\s*if \(bloodlineDist\[n\.id\] === undefined\) {\n\s*bloodlineDist\[n\.id\] = 999;\n\s*}\n\s*}\);/s, `nodesParam.forEach(n => {
        if (n.type === 'union') {
            bloodlineDist[n.id] = 0; // Union nodes ALWAYS belong to the core graph
        } else if (bloodlineDist[n.id] === undefined) {
            bloodlineDist[n.id] = 999;
        }
    });`);

fs.writeFileSync(path, content, 'utf8');
