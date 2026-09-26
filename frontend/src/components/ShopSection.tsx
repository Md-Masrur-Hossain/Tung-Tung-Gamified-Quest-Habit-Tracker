import React, { useState } from 'react';
import type { ShopItem, RewardProfile } from '../hooks/useRewards';

interface Props {
  items: ShopItem[];
  inventory: string[];
  profile: RewardProfile | null;
  onBuy: (itemId: string) => Promise<{ success: boolean; error?: string }>;
  onEquip: (itemId: string) => Promise<{ success: boolean; error?: string }>;
}

export const ShopSection: React.FC<Props> = ({ items, inventory, profile, onBuy, onEquip }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [equippingId, setEquippingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const categories = ['ALL', 'AVATAR', 'FRAME', 'AURA', 'COMPANION'];

  const filteredItems = items.filter((item) => {
    if (selectedCategory === 'ALL') return true;
    return item.category === selectedCategory;
  });

  const getRarityBadge = (rarity: string) => {
    switch (rarity) {
      case 'COMMON':
        return 'bg-slate-700 text-slate-300 border-slate-600';
      case 'RARE':
        return 'bg-blue-900/70 text-blue-300 border-blue-600';
      case 'EPIC':
        return 'bg-purple-900/70 text-purple-300 border-purple-600';
      case 'LEGENDARY':
        return 'bg-amber-900/70 text-amber-300 border-amber-500 animate-pulse';
      default:
        return 'bg-slate-700 text-slate-300';
    }
  };

  const isEquipped = (itemId: string) => {
    if (!profile) return false;
    return (
      profile.equippedAvatar === itemId ||
      profile.equippedFrame === itemId ||
      profile.equippedAura === itemId ||
      profile.equippedCompanion === itemId
    );
  };

  const handleBuy = async (itemId: string) => {
    setPurchasingId(itemId);
    setActionMessage(null);
    const res = await onBuy(itemId);
    if (!res.success) {
      setActionMessage(res.error || 'Failed to purchase');
    }
    setPurchasingId(null);
  };

  const handleEquip = async (itemId: string) => {
    setEquippingId(itemId);
    setActionMessage(null);
    const res = await onEquip(itemId);
    if (!res.success) {
      setActionMessage(res.error || 'Failed to equip');
    }
    setEquippingId(null);
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur mb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-5 border-b border-slate-800 gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🛒</span> Cosmetic & Reward Shop
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Spend earned Coins on avatars, frames, auras, and companions.
          </p>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {actionMessage && (
        <div className="mt-4 p-3 bg-rose-950/60 border border-rose-600/60 rounded-xl text-rose-300 text-xs flex justify-between items-center">
          <span>⚠️ {actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-rose-400 font-bold hover:underline">
            ✕
          </button>
        </div>
      )}

      {/* Grid of Items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {filteredItems.map((item) => {
          const owned = inventory.includes(item.id);
          const equipped = isEquipped(item.id);
          const userCoins = profile?.coins ?? 0;
          const canAfford = userCoins >= item.priceCoins;

          return (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                equipped
                  ? 'bg-indigo-950/40 border-indigo-500/80 shadow-lg shadow-indigo-950/50'
                  : owned
                  ? 'bg-slate-800/60 border-slate-700'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRarityBadge(item.rarity)}`}>
                    {item.rarity}
                  </span>
                  <span className="text-[10px] uppercase font-semibold text-slate-400">{item.category}</span>
                </div>

                <div className="text-3xl text-center my-3">
                  {item.cosmeticMetadata?.icon || '✨'}
                </div>

                <h3 className="font-bold text-white text-sm">{item.name}</h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/60">
                {equipped ? (
                  <button
                    disabled
                    className="w-full bg-emerald-600/30 text-emerald-300 text-xs font-bold py-2 rounded-lg border border-emerald-500/50 cursor-default"
                  >
                    ✓ Equipped
                  </button>
                ) : owned ? (
                  <button
                    onClick={() => handleEquip(item.id)}
                    disabled={equippingId === item.id}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 rounded-lg transition"
                  >
                    {equippingId === item.id ? 'Equipping...' : 'Equip Item'}
                  </button>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => handleBuy(item.id)}
                      disabled={!canAfford || purchasingId === item.id}
                      className={`w-full text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
                        canAfford
                          ? 'bg-amber-600 hover:bg-amber-500 text-white shadow'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      }`}
                    >
                      <span>🪙</span>
                      <span>{purchasingId === item.id ? 'Purchasing...' : `${item.priceCoins} Coins`}</span>
                    </button>
                    {!canAfford && (
                      <span className="text-[10px] text-amber-500/80 text-center font-medium">
                        Need {item.priceCoins - userCoins} more coins
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
