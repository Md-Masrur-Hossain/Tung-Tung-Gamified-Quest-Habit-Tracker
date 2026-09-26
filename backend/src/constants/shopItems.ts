export type ItemCategory = 'AVATAR' | 'FRAME' | 'AURA' | 'COMPANION' | 'COSMETIC';
export type ItemRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  priceCoins: number;
  rarity: ItemRarity;
  cosmeticMetadata: {
    icon?: string;
    color?: string;
    borderStyle?: string;
    animation?: string;
    type?: 'cat' | 'dog' | 'dragon' | 'robot';
    reactionDialogs?: {
      questComplete: string;
      streakMilestone: string;
      bossDefeated: string;
      levelUp: string;
    };
  };
  isAvailable: boolean;
}

export const SHOP_CATALOG: ShopItem[] = [
  // Avatars
  {
    id: 'avatar_warrior',
    name: 'Iron Vanguard',
    description: 'A resolute warrior clad in polished steel.',
    category: 'AVATAR',
    priceCoins: 50,
    rarity: 'RARE',
    cosmeticMetadata: { icon: '🛡️', color: '#3b82f6' },
    isAvailable: true,
  },
  {
    id: 'avatar_mage',
    name: 'Arcane Scholar',
    description: 'A master of ancient secrets and celestial spells.',
    category: 'AVATAR',
    priceCoins: 100,
    rarity: 'EPIC',
    cosmeticMetadata: { icon: '🔮', color: '#a855f7' },
    isAvailable: true,
  },
  {
    id: 'avatar_cyber',
    name: 'Cyber Nomad',
    description: 'A high-tech digital wanderer from tomorrow.',
    category: 'AVATAR',
    priceCoins: 200,
    rarity: 'LEGENDARY',
    cosmeticMetadata: { icon: '⚡', color: '#06b6d4' },
    isAvailable: true,
  },

  // Frames
  {
    id: 'frame_bronze',
    name: 'Bronze Crest',
    description: 'Sturdy bronze borders forged for new adventurers.',
    category: 'FRAME',
    priceCoins: 25,
    rarity: 'COMMON',
    cosmeticMetadata: { color: '#cd7f32', borderStyle: 'solid' },
    isAvailable: true,
  },
  {
    id: 'frame_gold',
    name: 'Gilded Laurels',
    description: 'Shining gold filigree worthy of a champion.',
    category: 'FRAME',
    priceCoins: 75,
    rarity: 'RARE',
    cosmeticMetadata: { color: '#eab308', borderStyle: 'double' },
    isAvailable: true,
  },
  {
    id: 'frame_neon',
    name: 'Neon Pulse',
    description: 'Pulsing synthwave border glowing with energy.',
    category: 'FRAME',
    priceCoins: 150,
    rarity: 'EPIC',
    cosmeticMetadata: { color: '#ec4899', borderStyle: 'dashed' },
    isAvailable: true,
  },

  // Auras
  {
    id: 'aura_spark',
    name: 'Ember Spark',
    description: 'Warm glowing sparks that flicker around your portrait.',
    category: 'AURA',
    priceCoins: 60,
    rarity: 'RARE',
    cosmeticMetadata: { animation: 'pulse', color: '#f97316' },
    isAvailable: true,
  },
  {
    id: 'aura_void',
    name: 'Celestial Void',
    description: 'Deep cosmic mist swirling with distant stars.',
    category: 'AURA',
    priceCoins: 250,
    rarity: 'LEGENDARY',
    cosmeticMetadata: { animation: 'spin-slow', color: '#8b5cf6' },
    isAvailable: true,
  },

  // Companions
  {
    id: 'companion_cat',
    name: 'Lucky Calico',
    description: 'A nimble feline that purrs when quests are completed.',
    category: 'COMPANION',
    priceCoins: 40,
    rarity: 'COMMON',
    cosmeticMetadata: {
      icon: '🐱',
      type: 'cat',
      reactionDialogs: {
        questComplete: 'Purr! Excellent execution, hooman!',
        streakMilestone: 'Meow! Your dedication is legendary!',
        bossDefeated: 'Paws of triumph! The giant has fallen!',
        levelUp: 'Nyan! You leveled up! Treats for everyone!',
      },
    },
    isAvailable: true,
  },
  {
    id: 'companion_dog',
    name: 'Loyal Hound',
    description: 'An enthusiastic companion that barks with joy.',
    category: 'COMPANION',
    priceCoins: 40,
    rarity: 'COMMON',
    cosmeticMetadata: {
      icon: '🐶',
      type: 'dog',
      reactionDialogs: {
        questComplete: 'Woof! Another quest down! Good job!',
        streakMilestone: 'Bark bark! Streak champion!',
        bossDefeated: 'Awoo! The boss stood no chance!',
        levelUp: 'Tail wagging maximum! Level UP!',
      },
    },
    isAvailable: true,
  },
  {
    id: 'companion_dragon',
    name: 'Pyre Wyvern',
    description: 'A fiery pocket dragon breathing embers of victory.',
    category: 'COMPANION',
    priceCoins: 180,
    rarity: 'EPIC',
    cosmeticMetadata: {
      icon: '🐲',
      type: 'dragon',
      reactionDialogs: {
        questComplete: 'Roar! Your momentum burns like dragonfire!',
        streakMilestone: 'An unbroken flame burns in your soul!',
        bossDefeated: 'The beast is vanquished in our blaze!',
        levelUp: 'The skies bow to your growing power!',
      },
    },
    isAvailable: true,
  },
  {
    id: 'companion_robot',
    name: 'Gizmo-01',
    description: 'A reliable mechanical droid calculating 100% success.',
    category: 'COMPANION',
    priceCoins: 80,
    rarity: 'RARE',
    cosmeticMetadata: {
      icon: '🤖',
      type: 'robot',
      reactionDialogs: {
        questComplete: 'Bleep bloop! Quest verified: 100% optimal.',
        streakMilestone: 'Efficiency rating exceeding all parameters!',
        bossDefeated: 'Target neutralized. Combat matrix victorious.',
        levelUp: 'System upgrade detected. User capabilities enhanced.',
      },
    },
    isAvailable: true,
  },

  // Unavailable test item (to test unavailable purchase rejection)
  {
    id: 'cosmetic_vaulted',
    name: 'Ancient Relic',
    description: 'A locked relic unavailable in the current shop rotation.',
    category: 'COSMETIC',
    priceCoins: 999,
    rarity: 'LEGENDARY',
    cosmeticMetadata: { icon: '🏺' },
    isAvailable: false,
  },
];
