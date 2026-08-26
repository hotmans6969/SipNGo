"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  available: number;
}

export default function MenuManagePage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    priceStr: "",
    category: "coffee",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const fetchItems = async () => {
    const res = await fetch("/api/admin/menu");
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "admin") {
      router.push("/");
      return;
    }
    // Initial load once the admin role is confirmed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchItems();
  }, [user, authLoading, router]);



  const resetForm = () => {
    setFormData({ name: "", description: "", priceStr: "", category: "coffee" });
    setEditingId(null);
    setShowForm(false);
    setError("");
  };

  const startEdit = (item: MenuItem) => {
    setFormData({
      name: item.name,
      description: item.description,
      priceStr: (item.price_cents / 100).toFixed(2),
      category: item.category,
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const priceCents = Math.round(parseFloat(formData.priceStr) * 100);
    if (isNaN(priceCents) || priceCents <= 0) {
      setError("Price must be a positive number");
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        const res = await fetch(`/api/admin/menu/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            priceCents,
            category: formData.category,
          }),
        });
        if (!res.ok) throw new Error("Failed to update");
      } else {
        const res = await fetch("/api/admin/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            priceCents,
            category: formData.category,
          }),
        });
        if (!res.ok) throw new Error("Failed to create");
      }

      resetForm();
      await fetchItems();
    } catch {
      setError("Failed to save menu item");
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    await fetch(`/api/admin/menu/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: !item.available }),
    });
    await fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    await fetch(`/api/admin/menu/${id}`, { method: "DELETE" });
    await fetchItems();
  };

  const categories = ["coffee", "tea", "smoothies", "juices", "pastries", "food"];

  if (authLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="space-y-4">
          <div className="h-8 skeleton rounded w-48" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 skeleton rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <Link href="/admin" className="text-amber-600 hover:text-amber-700 font-medium text-sm mb-1 inline-block">
            &larr; Back to Dashboard
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900">Manage Menu</h1>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white font-semibold px-5 py-3.5 sm:py-2 rounded-xl sm:rounded-lg transition-all active:scale-[0.98]"
        >
          + Add Item
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-stone-900 mb-4">
            {editingId ? "Edit Menu Item" : "Add New Menu Item"}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-stone-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-stone-900"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-stone-900"
              />
            </div>

            <div className="w-full sm:w-32">
              <label className="block text-sm font-medium text-stone-700 mb-1">Price (RM)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.priceStr}
                onChange={(e) => setFormData({ ...formData, priceStr: e.target.value })}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-stone-900"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3.5 sm:py-2.5 rounded-xl sm:rounded-lg transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update" : "Add Item"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Menu Items List */}
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={`bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 ${
              item.available ? "border-stone-200" : "border-red-200 bg-red-50/30"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`font-semibold ${item.available ? "text-stone-900" : "text-stone-400 line-through"}`}>
                  {item.name}
                </h3>
                <span className="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full capitalize">
                  {item.category}
                </span>
                {!item.available && (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Unavailable</span>
                )}
              </div>
              <p className="text-sm text-stone-400 truncate">{item.description}</p>
            </div>

            <span className="font-semibold text-amber-600 whitespace-nowrap sm:order-none">
              {formatPrice(item.price_cents)}
            </span>

            {/* Three across on a phone so each is a real target, inline once
                there is room for them beside the name. */}
            <div className="grid grid-cols-3 sm:flex gap-2 flex-shrink-0">
              <button
                onClick={() => toggleAvailability(item)}
                className={`text-sm sm:text-xs px-3 py-2.5 sm:py-1.5 rounded-lg font-medium transition-all active:scale-95 ${
                  item.available
                    ? "bg-stone-100 hover:bg-stone-200 text-stone-600"
                    : "bg-green-100 hover:bg-green-200 text-green-700"
                }`}
              >
                {item.available ? "Disable" : "Enable"}
              </button>
              <button
                onClick={() => startEdit(item)}
                className="text-sm sm:text-xs px-3 py-2.5 sm:py-1.5 rounded-lg font-medium bg-blue-100 hover:bg-blue-200 text-blue-700 transition-all active:scale-95"
              >
                Edit
              </button>
              <button
                onClick={() => deleteItem(item.id)}
                className="text-sm sm:text-xs px-3 py-2.5 sm:py-1.5 rounded-lg font-medium bg-red-100 hover:bg-red-200 text-red-700 transition-all active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
