import React from 'react';
import { User, Heart, Baby, Calendar, Skull } from 'lucide-react';

const FamilyNode = ({ node, style }) => {
    const isDead = !!node.death;

    return (
        <div
            className={`card glass ${node.gender} ${isDead ? 'deceased' : ''}`}
            style={style}
        >
            <img src={node.photo} alt={node.name} className="avatar" />
            <div className="name">{node.name}</div>
            <div className="dates">
                <span className="birth-date">
                    {node.birth ? new Date(node.birth).getFullYear() : '?'}
                </span>
                {isDead && (
                    <>
                        <span> - </span>
                        <span className="death-date">
                            {new Date(node.death).getFullYear()}
                        </span>
                    </>
                )}
            </div>

            <div className="node-info" style={{ marginTop: '12px', fontSize: '0.75rem', opacity: 0.8 }}>
                {node.spouses && node.spouses.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <Heart size={12} fill={node.gender === 'female' ? '#db2777' : '#0ea5e9'} stroke="none" />
                        <span>Married</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FamilyNode;
