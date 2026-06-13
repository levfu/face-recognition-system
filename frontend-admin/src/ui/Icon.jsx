import React from 'react';
import * as Icons from 'lucide-react';

export default function Icon({ name, size = 18, className = '' }) {
  const IconComp = Icons[name] || Icons['User'];
  return <IconComp size={size} className={className} />;
}
