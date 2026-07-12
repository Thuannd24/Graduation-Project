import { useCallback, useEffect, useState } from "react";
import { campaignApi } from "../../../../../services/campaignApi.ts";

// Manages the list of deployed campaigns + basic CRUD side-effects. Anything
// that needs to know the current list (both views + bottom panel tab) reads
// from `campaigns`.
export default function useCampaigns(showToast) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const data = await campaignApi.listCampaigns();
      setCampaigns(
        Array.isArray(data)
          ? [...data].sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
          : []
      );
    } catch (err) {
      console.warn("Load campaigns:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const toggleActive = useCallback(async (id, currentlyActive) => {
    try {
      await campaignApi.toggleCampaignActive(id, !currentlyActive);
      await fetchCampaigns();
    } catch (err) {
      showToast("Lỗi: " + err.message, "error");
    }
  }, [fetchCampaigns, showToast]);

  const removeCampaign = useCallback(async (id, name) => {
    if (!window.confirm('Xóa vĩnh viễn chiến dịch "' + name + '"?')) return;
    try {
      await campaignApi.deleteCampaign(id);
      await fetchCampaigns();
      showToast("Đã xóa chiến dịch", "success");
    } catch (err) {
      showToast("Lỗi: " + err.message, "error");
    }
  }, [fetchCampaigns, showToast]);

  return { campaigns, loading, fetchCampaigns, toggleActive, removeCampaign };
}
