import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Heart, User, UserCheck } from 'lucide-react';
import { motion } from 'framer-motion';

const FamilyMemberNode = ({ data }) => {
    const isDeceased = !!data.death;
    const isMale = data.gender === 'male';

    // Custom Avatar Component
    const Avatar = () => {
        if (data.photo && !data.photo.includes('unsplash.com')) {
            return <img src={data.photo} alt={data.name} className="node-avatar" />;
        }

        return (
            <motion.div
                className={`node-avatar placeholder ${data.gender}`}
                animate={{
                    scale: [1, 1.05, 1],
                    rotate: [0, 2, -2, 0]
                }}
                transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
                style={{
                    background: isMale ? 'linear-gradient(135deg, #0ea5e9, #38bdf8)' : 'linear-gradient(135deg, #db2777, #f472b6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    border: '2px solid white'
                }}
            >
                <User size={24} />
            </motion.div>
        );
    };

    return (
        <div className={`family-node glass ${data.gender} ${isDeceased ? 'deceased' : ''}`}>
            {/* Handles for Lineage */}
            <Handle type="target" position={Position.Top} id="top" style={{ background: '#94a3b8' }} />

            {/* Side handles for spanning connections (spouses/unions) */}
            {/* We provide both target and source on both sides for maximum flexibility */}
            <Handle type="target" position={Position.Left} id="left-target" style={{ left: 0, opacity: 0 }} />
            <Handle type="source" position={Position.Left} id="left-source" style={{ left: 0, opacity: 0 }} />

            <Handle type="target" position={Position.Right} id="right-target" style={{ right: 0, opacity: 0 }} />
            <Handle type="source" position={Position.Right} id="right-source" style={{ right: 0, opacity: 0 }} />

            <div className="node-content">
                <Avatar />
                <div className="node-info">
                    <div className="node-name">{data.name}</div>
                    <div className="node-dates">
                        {data.birth && !isNaN(new Date(data.birth).getFullYear()) ? new Date(data.birth).getFullYear() : '?'}
                        {data.death && !isNaN(new Date(data.death).getFullYear()) ? ` - ${new Date(data.death).getFullYear()}` : ''}
                    </div>
                </div>
            </div>

            <div className="spouse-indicators">
                {data.spouses?.map((s, idx) => (
                    <div key={idx} className={`spouse-dot ${s.type || 'married'}`} title={s.type === 'divorced' ? 'Bercerai' : 'Menikah'}>
                        <Heart size={8} fill={s.type === 'divorced' ? 'transparent' : 'currentColor'} />
                    </div>
                ))}
            </div>

            <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#94a3b8' }} />
        </div>
    );
};

export default memo(FamilyMemberNode);
