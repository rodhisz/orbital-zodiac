const fs = require('fs');

const path = 'src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

// The replacement logic
content = content.replace(/NodesParam\.forEach\(n => {\n\s*const m = n\.data;\n\s*if \(m && m\.type !== 'union' && \(m\.fatherId \|\| m\.motherId\)\) {\n\s*bloodlineDist\[m\.id\] = 0;\n\s*queue\.push\(m\.id\);\n\s*}\n\s*}\);/s, `nodesParam.forEach(n => {
        const m = n.data;
        if (!m || m.type === 'union') return;
        
        let isBloodline = false;
        if (m.fatherId || m.motherId) {
            isBloodline = true; // Punya ortu di sistem
        } else {
            // Cek apakah dia Punya Anak di sistem
            const hasChildren = nodesParam.some(child => {
                const cData = child.data;
                return cData && (cData.fatherId === m.id || cData.motherId === m.id);
            });
            if (hasChildren) isBloodline = true;
        }

        if (isBloodline) {
            bloodlineDist[m.id] = 0;
            queue.push(m.id);
        }
    });`);

fs.writeFileSync(path, content, 'utf8');
