import React from 'react';
import { MoveCategory } from '../types';

interface MoveClassificationIconProps {
  category: MoveCategory;
  className?: string;
}

const iconMap: Record<MoveCategory, string> = {
  'Brilliant': 'https://www.chess.com/bundles/web/images/color-icons/brilliant.svg',
  'Great': 'https://www.chess.com/bundles/web/images/color-icons/great-move.svg',
  'Best': 'https://www.chess.com/bundles/web/images/color-icons/best-move.svg',
  'Excellent': 'https://www.chess.com/bundles/web/images/color-icons/excellent.svg',
  'Good': 'https://www.chess.com/bundles/web/images/color-icons/good-move.svg',
  'Book': 'https://www.chess.com/bundles/web/images/color-icons/book.svg',
  'Inaccuracy': 'https://www.chess.com/bundles/web/images/color-icons/inaccuracy.svg',
  'Mistake': 'https://www.chess.com/bundles/web/images/color-icons/mistake.svg',
  'Blunder': 'https://www.chess.com/bundles/web/images/color-icons/blunder.svg',
  'Miss': 'https://www.chess.com/bundles/web/images/color-icons/miss.svg',
};

export const MoveClassificationIcon: React.FC<MoveClassificationIconProps> = ({ category, className = "w-4 h-4" }) => {
  return (
    <img 
      src={iconMap[category]} 
      alt={category} 
      className={`inline-block select-none ${className}`}
      title={category}
    />
  );
};