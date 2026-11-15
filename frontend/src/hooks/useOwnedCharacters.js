import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getShop } from "../services/shopApi";
import { FREE_CHARACTER_IDS } from "../game/characterAccess";

// No cached paid access: account changes and network errors always fall back to free chefs.
export default function useOwnedCharacters(enabled = true) {
  const [access, setAccess] = useState({ ids: FREE_CHARACTER_IDS, loading: enabled, error: "" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let generation = 0;
    let accountId;
    const refresh = async () => {
      const current = ++generation;
      if (active) setAccess({ ids: FREE_CHARACTER_IDS, loading: true, error: "" });
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        accountId = data.session?.user.id ?? null;
        const shop = data.session ? await getShop() : null;
        if (active && current === generation) setAccess({
          ids: [...new Set([...FREE_CHARACTER_IDS, ...(shop?.characters || []).filter((c) => c.owned).map((c) => c.id)])],
          loading: false, error: "",
        });
      } catch {
        if (active && current === generation) setAccess({ ids: FREE_CHARACTER_IDS, loading: false,
          error: "Could not verify purchased characters. Only free chefs are available. Reopen this page to retry." });
      }
    };
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" || (session?.user.id ?? null) === accountId) return;
      // Run outside Supabase's auth callback lock.
      setTimeout(() => { if (active) void refresh(); }, 0);
    });
    return () => { active = false; generation++; subscription.unsubscribe(); };
  }, [enabled]);
  return access;
}
