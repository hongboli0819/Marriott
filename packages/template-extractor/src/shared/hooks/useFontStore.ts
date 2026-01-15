/**
 * 字体状态管理 Hook
 * 管理上传的字体家族和当前选中状态
 */

import { useState, useCallback, useMemo } from "react";
import type { FontFamily, FontVariant } from "../lib/fontParser";
import { processFontFiles, weightToName } from "../lib/fontParser";

export interface FontStore {
  /** 所有已上传的字体家族 */
  families: FontFamily[];
  /** 当前选中的字体家族 ID */
  activeFamilyId: string | null;
  /** 当前选中的字重 */
  activeWeight: number;
  /** 是否正在加载 */
  isLoading: boolean;
}

export interface UseFontStoreReturn {
  /** 状态 */
  store: FontStore;
  /** 当前选中的字体家族 */
  activeFamily: FontFamily | null;
  /** 当前选中的字体变体 */
  activeVariant: FontVariant | null;
  /** 上传字体文件 */
  uploadFonts: (files: File[]) => Promise<void>;
  /** 删除字体家族 */
  removeFamily: (familyId: string) => void;
  /** 选择字体家族 */
  selectFamily: (familyId: string) => void;
  /** 选择字重 */
  selectWeight: (weight: number) => void;
  /** 获取字体家族的可用字重列表 */
  getAvailableWeights: (familyId?: string) => { value: number; label: string }[];
  /** 获取默认字体 CSS 值 */
  getDefaultFontFamily: () => string;
  /** 获取默认字重 */
  getDefaultFontWeight: () => number;
  /** 清空所有字体 */
  clearAll: () => void;
}

export function useFontStore(): UseFontStoreReturn {
  const [store, setStore] = useState<FontStore>({
    families: [],
    activeFamilyId: null,
    activeWeight: 400,
    isLoading: false,
  });

  // 当前选中的字体家族
  const activeFamily = useMemo(() => {
    if (!store.activeFamilyId) return null;
    return store.families.find((f) => f.id === store.activeFamilyId) || null;
  }, [store.families, store.activeFamilyId]);

  // 当前选中的字体变体
  const activeVariant = useMemo(() => {
    if (!activeFamily) return null;
    // 找到最接近的字重
    let closest = activeFamily.variants[0];
    let minDiff = Math.abs(closest.fontWeight - store.activeWeight);
    for (const v of activeFamily.variants) {
      const diff = Math.abs(v.fontWeight - store.activeWeight);
      if (diff < minDiff) {
        closest = v;
        minDiff = diff;
      }
    }
    return closest;
  }, [activeFamily, store.activeWeight]);

  // 上传字体文件
  const uploadFonts = useCallback(async (files: File[]) => {
    setStore((prev) => ({ ...prev, isLoading: true }));

    try {
      const newFamilies = await processFontFiles(files);
      
      setStore((prev) => {
        // 合并新字体和已有字体
        const merged = [...prev.families];
        for (const newFamily of newFamilies) {
          const existingIndex = merged.findIndex((f) => f.name === newFamily.name);
          if (existingIndex >= 0) {
            // 合并变体
            const existing = merged[existingIndex];
            for (const newVariant of newFamily.variants) {
              const variantIndex = existing.variants.findIndex(
                (v) => v.fontWeight === newVariant.fontWeight && v.fontStyle === newVariant.fontStyle
              );
              if (variantIndex >= 0) {
                existing.variants[variantIndex] = newVariant;
              } else {
                existing.variants.push(newVariant);
              }
            }
            // 重新排序和计算中间字重
            existing.variants.sort((a, b) => a.fontWeight - b.fontWeight);
            existing.middleWeight = existing.variants[Math.floor(existing.variants.length / 2)]?.fontWeight || 400;
          } else {
            merged.push(newFamily);
          }
        }

        // 如果没有选中的字体家族，自动选中第一个
        const activeFamilyId = prev.activeFamilyId || merged[0]?.id || null;
        const activeWeight = activeFamilyId
          ? merged.find((f) => f.id === activeFamilyId)?.middleWeight || 400
          : 400;

        return {
          ...prev,
          families: merged,
          activeFamilyId,
          activeWeight,
          isLoading: false,
        };
      });
    } catch (error) {
      console.error("[useFontStore] 上传字体失败:", error);
      setStore((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  // 删除字体家族
  const removeFamily = useCallback((familyId: string) => {
    setStore((prev) => {
      const family = prev.families.find((f) => f.id === familyId);
      if (family) {
        // 释放 blob URLs
        for (const variant of family.variants) {
          URL.revokeObjectURL(variant.blobUrl);
        }
      }

      const filtered = prev.families.filter((f) => f.id !== familyId);
      
      // 如果删除的是当前选中的，选中第一个
      let activeFamilyId = prev.activeFamilyId;
      let activeWeight = prev.activeWeight;
      if (activeFamilyId === familyId) {
        activeFamilyId = filtered[0]?.id || null;
        activeWeight = filtered[0]?.middleWeight || 400;
      }

      return {
        ...prev,
        families: filtered,
        activeFamilyId,
        activeWeight,
      };
    });
  }, []);

  // 选择字体家族
  const selectFamily = useCallback((familyId: string) => {
    setStore((prev) => {
      const family = prev.families.find((f) => f.id === familyId);
      if (!family) return prev;

      // 如果当前字重在新字体家族中不存在，使用中间字重
      const hasWeight = family.variants.some((v) => v.fontWeight === prev.activeWeight);
      const activeWeight = hasWeight ? prev.activeWeight : family.middleWeight;

      return {
        ...prev,
        activeFamilyId: familyId,
        activeWeight,
      };
    });
  }, []);

  // 选择字重
  const selectWeight = useCallback((weight: number) => {
    setStore((prev) => ({
      ...prev,
      activeWeight: weight,
    }));
  }, []);

  // 获取可用字重列表
  const getAvailableWeights = useCallback(
    (familyId?: string): { value: number; label: string }[] => {
      const id = familyId || store.activeFamilyId;
      if (!id) return [];
      
      const family = store.families.find((f) => f.id === id);
      if (!family) return [];

      return family.variants.map((v) => ({
        value: v.fontWeight,
        label: `${weightToName(v.fontWeight)} (${v.fontWeight})`,
      }));
    },
    [store.families, store.activeFamilyId]
  );

  // 获取默认字体 CSS 值
  const getDefaultFontFamily = useCallback((): string => {
    if (activeFamily) {
      return activeFamily.name;
    }
    return "Microsoft YaHei, sans-serif";
  }, [activeFamily]);

  // 获取默认字重
  const getDefaultFontWeight = useCallback((): number => {
    if (activeFamily) {
      return activeFamily.middleWeight;
    }
    return 400;
  }, [activeFamily]);

  // 清空所有字体
  const clearAll = useCallback(() => {
    setStore((prev) => {
      // 释放所有 blob URLs
      for (const family of prev.families) {
        for (const variant of family.variants) {
          URL.revokeObjectURL(variant.blobUrl);
        }
      }
      return {
        families: [],
        activeFamilyId: null,
        activeWeight: 400,
        isLoading: false,
      };
    });
  }, []);

  return {
    store,
    activeFamily,
    activeVariant,
    uploadFonts,
    removeFamily,
    selectFamily,
    selectWeight,
    getAvailableWeights,
    getDefaultFontFamily,
    getDefaultFontWeight,
    clearAll,
  };
}


