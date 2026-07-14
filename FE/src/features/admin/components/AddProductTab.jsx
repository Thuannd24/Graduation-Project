import React, { useState, useEffect, useRef } from "react";
import Icon from "../../../components/common/Icon.jsx";
import { productApi } from "../../../services/productApi.ts";
import { buildSalePricePayload, validateProductPricing } from "../../../utils/pricing.ts";

export default function AddProductTab({ onSaveProduct, editingProductId, setEditingProductId, initialData }) {
  // Master lists
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditingLoaded, setIsEditingLoaded] = useState(false);

  // Form states
  const [basicInfo, setBasicInfo] = useState({
    name: initialData?.name || "",
    slug: "",
    description: initialData
      ? "Sản phẩm được thêm nhanh từ trang tổng quan Admin."
      : "",
    price: initialData?.price ?? "",
    costPrice: "",
    salePrice: "",
    weight: "200",
    length: "15",
    width: "7",
    height: "1",
    categoryId: "",
    brandId: "",
    imageUrl: "",
    images: [],
    status: "PUBLISHED", // DRAFT, PUBLISHED, OUT_OF_STOCK, ARCHIVED
    active: true,
    warrantyPeriod: "12",
    warrantyPolicy: "Bảo hành chính hãng 12 tháng.",
    tags: ""
  });

  // Secondary Image gallery text input
  const [tempGalleryUrl, setTempGalleryUrl] = useState("");

  // Dynamic EAV attributes for the selected category
  const [categoryAttributes, setCategoryAttributes] = useState([]);
  const [specifications, setSpecifications] = useState([]); // static attributes
  const [variantAttributes, setVariantAttributes] = useState([]); // variant attributes

  // User input states for dynamic EAV
  const [specValues, setSpecValues] = useState({}); // { [attrCode]: value }
  const [variantOptionValues, setVariantOptionValues] = useState({}); // { [attrCode]: ['Val1', 'Val2'] }
  const [newOptionInput, setNewOptionInput] = useState({}); // { [attrCode]: string } - text input khi tự nhập

  // Final generated variants grid
  const [generatedVariants, setGeneratedVariants] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Ref để chặn useEffect category trong khi đang load dữ liệu edit
  const isEditingLoadStarted = useRef(false);
  // Lưu lại categoryId đã được load khi edit - để phân biệt "trigger do load edit" vs "user đổi danh mục"
  const loadedForEditCategoryRef = useRef(null);

  // Multi-image state management
  const [uploadedImages, setUploadedImages] = useState([]);

  // Sync uploadedImages with basicInfo.imageUrl and basicInfo.images
  useEffect(() => {
    const main = uploadedImages.find(img => img.isMain)?.url || uploadedImages[0]?.url || "";
    const secondaries = uploadedImages.filter(img => img.url !== main).map(img => img.url);
    setBasicInfo(prev => ({
      ...prev,
      imageUrl: main,
      images: secondaries
    }));
  }, [uploadedImages]);

  // Helper for preset color/size palettes
  const getPresetsForAttribute = (code) => {
    // 1. Kiểm tra xem thuộc tính này trong DB có cấu hình sẵn allowedValues (tùy chọn được phép) hay không
    const matchedAttr = variantAttributes.find(v => v.attributeCode === code);
    const dbAllowedValues = matchedAttr?.attributeAllowedValues;

    if (dbAllowedValues && dbAllowedValues.trim().length > 0) {
      const isColor = code.toLowerCase().includes("color") || code.toLowerCase().includes("mau");

      // 1. Cố gắng parse dạng JSON được cấu hình bằng giao diện hàng mới
      try {
        const parsed = JSON.parse(dbAllowedValues);
        if (Array.isArray(parsed)) {
          if (isColor) {
            return {
              type: "color",
              items: parsed.map(opt => ({
                name: opt.name,
                value: opt.name,
                color: opt.hex || "#cbd5e1",
                border: opt.hex?.toLowerCase() === "#ffffff"
              }))
            };
          } else {
            return {
              type: "text",
              items: parsed.map(opt => opt.name)
            };
          }
        }
      } catch (e) {
        // 2. Dự phòng (fallback) nếu allowedValues trong DB là dạng text phân tách bằng dấu phẩy cũ
        const items = dbAllowedValues.split(",").map(val => val.trim()).filter(Boolean);
        if (isColor) {
          return {
            type: "color",
            items: items.map(item => {
              if (item.includes("|")) {
                const [name, colorHex] = item.split("|");
                return {
                  name: name.trim(),
                  value: name.trim(),
                  color: colorHex.trim(),
                  border: colorHex.trim().toLowerCase() === "#ffffff"
                };
              }
              if (item.startsWith("#")) {
                return { name: item, value: item, color: item, border: item.toLowerCase() === "#ffffff" };
              }
              return { name: item, value: item, color: "#cbd5e1" };
            })
          };
        } else {
          return {
            type: "text",
            items: items
          };
        }
      }
    }

    // Không dùng fallback - chỉ dùng dữ liệu từ API attributeAllowedValues
    return null;
  };

  const togglePresetValue = (code, value) => {
    const currentList = variantOptionValues[code] || [];
    if (currentList.includes(value)) {
      setVariantOptionValues(prev => ({
        ...prev,
        [code]: prev[code].filter(v => v !== value)
      }));
    } else {
      setVariantOptionValues(prev => ({
        ...prev,
        [code]: [...currentList, value]
      }));
    }
  };

  const handleAddImageUrl = () => {
    if (!tempGalleryUrl.trim()) return;
    setUploadedImages(prev => {
      const hasMain = prev.some(img => img.isMain);
      return [
        ...prev,
        {
          id: Date.now() + Math.random(),
          url: tempGalleryUrl.trim(),
          isMain: !hasMain && prev.length === 0
        }
      ];
    });
    setTempGalleryUrl("");
  };

  const setMainImage = (id) => {
    setUploadedImages(prev => prev.map(img => ({
      ...img,
      isMain: img.id === id
    })));
  };

  const deleteImage = (id) => {
    setUploadedImages(prev => {
      const itemToDelete = prev.find(img => img.id === id);
      const remaining = prev.filter(img => img.id !== id);
      if (itemToDelete?.isMain && remaining.length > 0) {
        remaining[0].isMain = true;
      }
      return remaining;
    });
  };

  // Reset effect when editingProductId is unset
  useEffect(() => {
    if (!editingProductId) {
      setIsEditingLoaded(false);
      setBasicInfo({
        name: "",
        slug: "",
        description: "",
        price: "",
        costPrice: "",
        salePrice: "",
        weight: "200",
        length: "15",
        width: "7",
        height: "1",
        categoryId: "",
        brandId: "",
        imageUrl: "",
        images: [],
        status: "PUBLISHED",
        active: true,
        warrantyPeriod: "12",
        warrantyPolicy: "Bảo hành chính hãng 12 tháng.",
        tags: ""
      });
      setUploadedImages([]);
      setCategoryAttributes([]);
      setSpecifications([]);
      setVariantAttributes([]);
      setSpecValues({});
      setVariantOptionValues({});
      setNewOptionInput({});
      setGeneratedVariants([]);
    }
  }, [editingProductId]);

  // Fetch initial categories, brands, and product details if editing
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [catsTree, brandsList] = await Promise.all([
          productApi.listCategories(),
          productApi.listBrands()
        ]);

        // Flatten category tree for select list
        const flatCats = [];
        function flatten(node, prefix = "") {
          const currentLabel = prefix ? `${prefix} > ${node.name}` : node.name;
          flatCats.push({ id: node.id, label: currentLabel });
          if (node.children && node.children.length > 0) {
            node.children.forEach(child => flatten(child, currentLabel));
          }
        }
        catsTree.forEach(root => flatten(root));

        setCategories(flatCats);
        setBrands(brandsList);

        if (!editingProductId && initialData?.categoryHint) {
          const hint = initialData.categoryHint.toLowerCase();
          const matched = flatCats.find(c => c.label.toLowerCase().includes(hint));
          if (matched) {
            setBasicInfo(prev => ({ ...prev, categoryId: matched.id }));
          }
        }

        if (editingProductId) {
          // Đánh dấu đang load edit TRƯỚC KHI fetch/set bất kỳ state nào
          // để useEffect theo dõi categoryId không chạy reset data
          isEditingLoadStarted.current = true;

          const detail = await productApi.getProductDetail(editingProductId);

          // Set ref NGAY LẬP TỨC sau khi có detail, TRƯỚC setBasicInfo
          // → đảm bảo Guard 2 trong useEffect #2 đã có giá trị
          //   trước khi categoryId thay đổi kích hoạt effect đó
          loadedForEditCategoryRef.current = detail.categoryId;

          // Populate basicInfo
          setBasicInfo({
            name: detail.name || "",
            slug: detail.slug || "",
            description: detail.description || "",
            price: (detail.listPrice ?? detail.price) || "",
            costPrice: detail.costPrice || "",
            salePrice: detail.salePrice || "",
            weight: detail.weight || "200",
            length: detail.length || "15",
            width: detail.width || "7",
            height: detail.height || "1",
            categoryId: detail.categoryId || "",
            brandId: detail.brandId || "",
            imageUrl: detail.imageUrl || detail.image || "",
            images: detail.images || detail.gallery || [],
            status: detail.status || "PUBLISHED",
            active: detail.active !== false,
            warrantyPeriod: detail.warrantyPeriod || "12",
            warrantyPolicy: detail.warrantyPolicy || "Bảo hành chính hãng 12 tháng.",
            tags: Array.isArray(detail.tags) ? detail.tags.join(", ") : (detail.tags || "")
          });

          // Populate uploadedImages
          const imgs = [];
          if (detail.imageUrl || detail.image) {
            imgs.push({
              id: 1,
              url: detail.imageUrl || detail.image,
              isMain: true
            });
          }
          const secondaries = detail.images || detail.gallery || [];
          secondaries.forEach((url, i) => {
            if (url !== (detail.imageUrl || detail.image)) {
              imgs.push({
                id: 2 + i,
                url,
                isMain: false
              });
            }
          });
          setUploadedImages(imgs);

          // Fetch attributes for this editing product's category immediately
          if (detail.categoryId) {
            const attrs = await productApi.getCategoryAttributes(detail.categoryId);
            setCategoryAttributes(attrs);

            const specs = attrs.filter(a => !a.isVariant);
            const vars = attrs.filter(a => a.isVariant);

            setSpecifications(specs);
            setVariantAttributes(vars);

            // Populate specValues
            const specsObj = {};
            specs.forEach(s => {
              specsObj[s.attributeCode] = detail.attributes?.[s.attributeCode] || "";
            });
            setSpecValues(specsObj);

            // Populate variantOptionValues
            const extractedVars = {};
            const initialInput = {};

            vars.forEach(v => {
              extractedVars[v.attributeCode] = [];
              initialInput[v.attributeCode] = "";
            });

            if (Array.isArray(detail.variants)) {
              detail.variants.forEach(variant => {
                if (variant.variantAttr) {
                  Object.entries(variant.variantAttr).forEach(([code, val]) => {
                    if (extractedVars[code] && !extractedVars[code].includes(val)) {
                      extractedVars[code].push(val);
                    }
                  });
                }
              });
            }

            setVariantOptionValues(extractedVars);
            setNewOptionInput(initialInput);

            // Populate generatedVariants
            if (Array.isArray(detail.variants)) {
              setGeneratedVariants(detail.variants.map((v, index) => ({
                id: index,
                sku: v.sku || "",
                variantAttr: v.variantAttr || {},
                price: v.price ?? "",
                costPrice: v.costPrice ?? "",
                weight: v.weight ?? 200,
                imageUrl: v.imageUrl || "",
                active: v.active !== false
              })));
            }
          }
          setIsEditingLoaded(true);
          isEditingLoadStarted.current = false;
        }
      } catch (err) {
        console.error("Failed to load initial data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [editingProductId]);

  // Hàm load attributes khi USER CHỦ ĐỘNG chọn danh mục
  // Không dùng useEffect để tránh race condition với chế độ edit
  const handleCategoryChange = async (newCategoryId) => {
    setBasicInfo(prev => ({ ...prev, categoryId: newCategoryId }));

    if (!newCategoryId) {
      setCategoryAttributes([]);
      setSpecifications([]);
      setVariantAttributes([]);
      setSpecValues({});
      setVariantOptionValues({});
      setGeneratedVariants([]);
      return;
    }

    try {
      const attrs = await productApi.getCategoryAttributes(newCategoryId);
      setCategoryAttributes(attrs);

      const specs = attrs.filter(a => !a.isVariant);
      const vars = attrs.filter(a => a.isVariant);

      setSpecifications(specs);
      setVariantAttributes(vars);

      const initialSpecs = {};
      specs.forEach(s => { initialSpecs[s.attributeCode] = ""; });
      setSpecValues(initialSpecs);

      const initialVars = {};
      const initialInput = {};
      vars.forEach(v => {
        initialVars[v.attributeCode] = [];
        initialInput[v.attributeCode] = "";
      });
      setVariantOptionValues(initialVars);
      setNewOptionInput(initialInput);
      setGeneratedVariants([]);
    } catch (err) {
      console.error("Failed to load category attributes", err);
    }
  };

  // Helper to auto-generate slug
  const handleNameChange = (e) => {
    const name = e.target.value;
    const slug = slugify(name);
    setBasicInfo(prev => ({ ...prev, name, slug }));
  };

  const slugify = (text) => {
    return text
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/([^a-z0-9\s-]|_)+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  };

  // SKU ví dụ: ULTRABOOK14-BAC-16GB (slug không dấu gạch + giá trị biến thể)
  const getProductSkuPrefix = () => {
    const slug = basicInfo.slug?.trim();
    if (!slug) return "";
    return slugify(slug).replace(/-/g, "").toUpperCase();
  };

  const buildSkuFromCombination = (comb) => {
    const prefix = getProductSkuPrefix();
    const suffix = comb.map(v => slugify(v).toUpperCase()).join("-");
    return suffix ? `${prefix}-${suffix}` : prefix;
  };

  // Image uploader utilities — upload lên MinIO qua product-service
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const url = await productApi.uploadProductImage(file, "products");
        setUploadedImages(prev => {
          const hasMain = prev.some(img => img.isMain);
          return [
            ...prev,
            {
              id: Date.now() + Math.random(),
              url,
              isMain: !hasMain && prev.length === 0
            }
          ];
        });
      } catch (err) {
        alert("Lỗi upload ảnh: " + err.message);
      }
    }
    e.target.value = "";
  };

  const removeVariantValue = (code, valToRemove) => {
    setVariantOptionValues(prev => ({
      ...prev,
      [code]: prev[code].filter(v => v !== valToRemove)
    }));
  };

  // Generate Cartesian Product of variants
  const generateVariantsGrid = () => {
    if (!basicInfo.slug?.trim()) {
      alert("Vui lòng nhập tên sản phẩm để tạo slug trước khi sinh biến thể.");
      return;
    }

    const missingValues = variantAttributes.filter(v => !variantOptionValues[v.attributeCode] || variantOptionValues[v.attributeCode].length === 0);

    if (variantAttributes.length > 0 && missingValues.length > 0) {
      alert(`Vui lòng điền ít nhất một giá trị cho thuộc tính biến thể: ${missingValues.map(m => m.attributeName).join(", ")}`);
      return;
    }

    const cartesian = (arrays) => {
      return arrays.reduce((acc, curr) => {
        return acc.flatMap(d => curr.map(e => [...d, e]));
      }, [[]]);
    };

    const keys = variantAttributes.map(v => v.attributeCode);
    const valueArrays = variantAttributes.map(v => variantOptionValues[v.attributeCode]);

    if (keys.length === 0) {
      alert("Danh mục này không yêu cầu biến thể (chỉ có sản phẩm đơn thể).");
      return;
    }

    const combinations = cartesian(valueArrays);
    const existingByKey = new Map(
      generatedVariants.map(v => [JSON.stringify(v.variantAttr), v])
    );
    const usedSkus = new Set();

    const generated = combinations.map((comb, index) => {
      const variantAttr = {};

      comb.forEach((val, i) => {
        variantAttr[keys[i]] = val;
      });

      const attrKey = JSON.stringify(variantAttr);
      const existing = existingByKey.get(attrKey);

      let generatedSku = existing?.sku || buildSkuFromCombination(comb);
      let counter = 2;
      const baseSku = generatedSku;
      while (usedSkus.has(generatedSku.toUpperCase())) {
        generatedSku = `${baseSku}-${counter++}`;
      }
      usedSkus.add(generatedSku.toUpperCase());

      return {
        id: index,
        sku: generatedSku,
        variantAttr,
        price: existing?.price ?? buildSalePricePayload(basicInfo.price, basicInfo.salePrice) ?? Number(basicInfo.price || 0),
        costPrice: existing?.costPrice ?? (basicInfo.costPrice || 0),
        weight: existing?.weight ?? (basicInfo.weight || 200),
        imageUrl: existing?.imageUrl || "",
        active: existing?.active ?? true
      };
    });

    setGeneratedVariants(generated);
  };

  // Update specific field in the SKU variants grid
  const updateVariantField = (id, field, value) => {
    setGeneratedVariants(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const handleVariantImageUpload = async (variantId, file) => {
    if (!file) return;
    try {
      const url = await productApi.uploadProductImage(file, "variants");
      updateVariantField(variantId, "imageUrl", url);
    } catch (err) {
      alert("Lỗi upload ảnh biến thể: " + err.message);
    }
  };

  // Submit flow
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!basicInfo.categoryId) {
      alert("Vui lòng chọn danh mục.");
      return;
    }
    if (!basicInfo.brandId) {
      alert("Vui lòng chọn thương hiệu.");
      return;
    }

    if (variantAttributes.length > 0 && generatedVariants.length === 0) {
      alert("Vui lòng nhấn 'Tạo danh sách biến thể' để cấu hình các SKU trước khi đăng.");
      return;
    }

    if (!basicInfo.imageUrl?.trim()) {
      alert("Vui lòng tải lên ít nhất một ảnh chính cho sản phẩm.");
      return;
    }

    const pricingError = validateProductPricing(basicInfo.price, basicInfo.salePrice);
    if (pricingError) {
      alert(pricingError);
      return;
    }

    if (generatedVariants.length > 0) {
      const skuList = generatedVariants.map(v => v.sku.trim().toUpperCase()).filter(Boolean);
      const duplicateSkus = skuList.filter((sku, idx) => skuList.indexOf(sku) !== idx);
      if (duplicateSkus.length > 0) {
        alert(`Mã SKU bị trùng trong danh sách: ${[...new Set(duplicateSkus)].join(", ")}. Vui lòng sửa trước khi đăng.`);
        return;
      }

      const missingVariantImages = generatedVariants.filter(v => !v.imageUrl?.trim());
      if (missingVariantImages.length > 0) {
        alert("Vui lòng tải ảnh đại diện cho từng biến thể SKU trước khi đăng.");
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const cleanSpecs = {};
      Object.entries(specValues).forEach(([k, v]) => {
        if (v && v.trim()) {
          cleanSpecs[k] = v.trim();
        }
      });

      const tagsArray = basicInfo.tags
        ? basicInfo.tags.split(",").map(t => t.trim()).filter(Boolean)
        : [];

      const payload = {
        name: basicInfo.name,
        slug: basicInfo.slug,
        description: basicInfo.description,
        price: Number(basicInfo.price),
        costPrice: Number(basicInfo.costPrice || 0),
        salePrice: buildSalePricePayload(basicInfo.price, basicInfo.salePrice),
        weight: Number(basicInfo.weight || 0),
        length: Number(basicInfo.length || 0),
        width: Number(basicInfo.width || 0),
        height: Number(basicInfo.height || 0),
        categoryId: Number(basicInfo.categoryId),
        brandId: Number(basicInfo.brandId),
        imageUrl: basicInfo.imageUrl,
        images: basicInfo.images,
        status: basicInfo.status,
        warrantyPeriod: Number(basicInfo.warrantyPeriod || 12),
        warrantyPolicy: basicInfo.warrantyPolicy,
        active: basicInfo.active,
        tags: tagsArray,
        attributes: cleanSpecs,
        variants: generatedVariants.map(v => ({
          sku: v.sku,
          variantAttr: v.variantAttr,
          price: Number(v.price),
          costPrice: Number(v.costPrice),
          weight: Number(v.weight),
          imageUrl: v.imageUrl,
          active: v.active
        }))
      };

      if (editingProductId) {
        await productApi.updateProduct(editingProductId, payload);
        alert("Cập nhật sản phẩm thành công!");
        if (setEditingProductId) {
          setEditingProductId(null);
        }
      } else {
        await productApi.createProduct(payload);
        alert("Đăng bán sản phẩm thành công!");
      }
      if (onSaveProduct) {
        onSaveProduct(payload);
      }
    } catch (err) {
      alert((editingProductId ? "Lỗi khi cập nhật sản phẩm: " : "Lỗi khi thêm sản phẩm: ") + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin"></div>
        <span className="text-sm font-semibold text-slate-400">Đang tải danh mục & cấu hình...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn p-6 max-w-[1200px] mx-auto text-slate-800">

      {/* Header */}
      <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 rounded-2xl border shadow-sm gap-4 ${editingProductId
          ? "bg-gradient-to-r from-amber-50 to-white dark:from-amber-950/20 dark:to-slate-900 border-amber-200 dark:border-amber-800/40"
          : "bg-gradient-to-r from-emerald-50 to-white dark:from-emerald-950/20 dark:to-slate-900 border-emerald-200 dark:border-emerald-800/40"
        }`}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${editingProductId
              ? "bg-amber-100 dark:bg-amber-900/30"
              : "bg-emerald-100 dark:bg-emerald-900/30"
            }`}>
            <Icon
              name={editingProductId ? "edit" : "add_circle"}
              className={`text-2xl ${editingProductId ? "text-amber-600" : "text-emerald-600"}`}
            />
          </div>
          <div>
            <h4 className="text-xl font-black text-slate-800 dark:text-slate-200 tracking-tight">
              {editingProductId ? "Chỉnh Sửa Sản Phẩm" : "Thêm Sản Phẩm Mới"}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${editingProductId
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                }`}>
                <Icon name={editingProductId ? "edit_note" : "add"} className="text-xs" />
                {editingProductId ? "CHẾ ĐỘ CHỈNH SỬA" : "CHẾ ĐỘ THÊM MỚI"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          {editingProductId && (
            <button
              type="button"
              onClick={() => {
                if (setEditingProductId) setEditingProductId(null);
                if (onSaveProduct) onSaveProduct(null);
              }}
              className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
            >
              <Icon name="close" className="text-sm" />
              <span>Hủy</span>
            </button>
          )}
          <button
            type="submit"
            form="productForm"
            disabled={isSubmitting}
            className={`px-6 py-2.5 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center gap-2 ${editingProductId
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-emerald-600 hover:bg-emerald-700"
              }`}
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <Icon name={editingProductId ? "save" : "rocket_launch"} className="text-sm" />
            )}
            <span>{editingProductId ? "Lưu Thay Đổi" : "Đăng Bán Ngay"}</span>
          </button>
        </div>
      </div>

      <form id="productForm" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column: Form Details (8/12) */}
        <div className="lg:col-span-8 space-y-6">

          {/* Section 1: Basic Information */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm space-y-4">
            <span className="font-extrabold text-sm text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Icon name="info" className="text-emerald-600 text-lg" /> Thông Tin Cơ Bản
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Tên sản phẩm *</label>
                <input
                  type="text"
                  required
                  value={basicInfo.name}
                  onChange={handleNameChange}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                  placeholder="Ví dụ: Ultrabook 14"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Slug liên kết đường dẫn *</label>
                <input
                  type="text"
                  required
                  value={basicInfo.slug}
                  onChange={(e) => setBasicInfo({ ...basicInfo, slug: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                  placeholder="ultrabook-14"
                />
                <p className="text-[10px] text-slate-500 font-medium">
                  SKU biến thể dùng slug làm tiền tố, ví dụ slug <code className="text-emerald-700">ultrabook-14</code> → <code className="text-emerald-700">ULTRABOOK14-BAC-16GB</code>
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Mô tả sản phẩm chi tiết</label>
              <textarea
                rows="4"
                value={basicInfo.description}
                onChange={(e) => setBasicInfo({ ...basicInfo, description: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 leading-relaxed transition-all outline-none"
                placeholder="Mô tả các đặc điểm kỹ thuật nổi bật của sản phẩm..."
              />
            </div>
          </div>

          {/* Section 2: Pricing & Logistics */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm space-y-4">
            <span className="font-extrabold text-sm text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Icon name="payments" className="text-emerald-600 text-lg" /> Bảng Giá & Thông Số Gói Hàng (Shipping)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Giá niêm yết (đ) *</label>
                <input
                  type="number"
                  required
                  value={basicInfo.price}
                  onChange={(e) => setBasicInfo({ ...basicInfo, price: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                  placeholder="30000000"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Giá vốn / Giá nhập (đ)</label>
                <input
                  type="number"
                  value={basicInfo.costPrice}
                  onChange={(e) => setBasicInfo({ ...basicInfo, costPrice: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                  placeholder="25000000"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Giá khuyến mãi (đ)</label>
                <input
                  type="number"
                  min="0"
                  value={basicInfo.salePrice}
                  onChange={(e) => setBasicInfo({ ...basicInfo, salePrice: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                  placeholder="Để trống nếu không giảm giá"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-450 uppercase tracking-wider block">Trọng lượng (gram)</label>
                <input
                  type="number"
                  value={basicInfo.weight}
                  onChange={(e) => setBasicInfo({ ...basicInfo, weight: e.target.value })}
                  className="w-full bg-white border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-450 uppercase tracking-wider block">Dài (cm)</label>
                <input
                  type="number"
                  value={basicInfo.length}
                  onChange={(e) => setBasicInfo({ ...basicInfo, length: e.target.value })}
                  className="w-full bg-white border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-450 uppercase tracking-wider block">Rộng (cm)</label>
                <input
                  type="number"
                  value={basicInfo.width}
                  onChange={(e) => setBasicInfo({ ...basicInfo, width: e.target.value })}
                  className="w-full bg-white border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-450 uppercase tracking-wider block">Cao (cm)</label>
                <input
                  type="number"
                  value={basicInfo.height}
                  onChange={(e) => setBasicInfo({ ...basicInfo, height: e.target.value })}
                  className="w-full bg-white border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/10 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Dynamic Category Specifications (Static EAV) */}
          {basicInfo.categoryId && specifications.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm space-y-4">
              <span className="font-extrabold text-sm text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
                <Icon name="analytics" className="text-emerald-600 text-lg" /> Thông Số Kỹ Thuật Động (Static EAV)
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {specifications.map((spec) => (
                  <div key={spec.id} className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                      {spec.attributeName} {spec.isRequired && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      required={spec.isRequired}
                      value={specValues[spec.attributeCode] || ""}
                      onChange={(e) => setSpecValues({ ...specValues, [spec.attributeCode]: e.target.value })}
                      placeholder={`Nhập ${spec.attributeName.toLowerCase()}...`}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 transition-all outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Dynamic Variant Axis Generation */}
          {basicInfo.categoryId && (variantAttributes.length > 0 || generatedVariants.length > 0) && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm space-y-6">
              <span className="font-extrabold text-sm text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
                <Icon name="tune" className="text-emerald-600 text-lg" /> Cấu Hình Các Trục Biến Thể Động
              </span>

              {/* Chỉ hiện phần chọn option nếu category có variant attributes */}
              {variantAttributes.length > 0 && (
                <div className="space-y-5">
                  {variantAttributes.map((vAttr) => (
                    <div key={vAttr.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-4">
                      <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wide block">
                        Trục biến thể: {vAttr.attributeName} {vAttr.isRequired && <span className="text-red-500">*</span>}
                      </label>

                      {/* Presets Grid */}
                      {(() => {
                        const presets = getPresetsForAttribute(vAttr.attributeCode);
                        if (!presets) {
                          return (
                            <p className="text-[11px] text-amber-600 font-semibold italic">
                              Thuộc tính này chưa có lựa chọn được cấu hình. Hãy thêm options trong mục Bộ Thuộc Tính Hệ Thống.
                            </p>
                          );
                        }

                        return (
                          <div className="space-y-2 py-1">
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                              Chọn {vAttr.attributeName.toLowerCase()}:
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {presets.items.map((preset) => {
                                const value = typeof preset === "object" ? preset.value : preset;
                                const label = typeof preset === "object" ? preset.name : preset;
                                const isSelected = variantOptionValues[vAttr.attributeCode]?.includes(value);

                                if (presets.type === "color") {
                                  return (
                                    <button
                                      key={value}
                                      type="button"
                                      onClick={() => togglePresetValue(vAttr.attributeCode, value)}
                                      className={`relative group flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all shadow-sm ${isSelected
                                          ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/10"
                                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                        }`}
                                      title={label}
                                    >
                                      <span
                                        className={`w-3.5 h-3.5 rounded-full block border ${preset.border ? "border-slate-300" : "border-transparent"}`}
                                        style={{ backgroundColor: preset.color }}
                                      />
                                      <span>{label}</span>
                                    </button>
                                  );
                                } else {
                                  return (
                                    <button
                                      key={value}
                                      type="button"
                                      onClick={() => togglePresetValue(vAttr.attributeCode, value)}
                                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm ${isSelected
                                          ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/10 font-extrabold"
                                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                        }`}
                                    >
                                      {label}
                                    </button>
                                  );
                                }
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Chips đã chọn */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {variantOptionValues[vAttr.attributeCode]?.map((chip, cIdx) => (
                          <span
                            key={cIdx}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold rounded-full shadow-sm"
                          >
                            <span>{chip}</span>
                            <button
                              type="button"
                              onClick={() => removeVariantValue(vAttr.attributeCode, chip)}
                              className="w-4.5 h-4.5 rounded-full bg-emerald-200/60 hover:bg-emerald-200 text-emerald-900 flex items-center justify-center font-bold text-[11px]"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        {(!variantOptionValues[vAttr.attributeCode] || variantOptionValues[vAttr.attributeCode].length === 0) && (
                          <span className="text-xs text-slate-450 italic">Chưa chọn tùy chọn nào.</span>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Generate combinations trigger */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={generateVariantsGrid}
                      className="self-start px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-2"
                    >
                      <Icon name="auto_awesome" className="text-sm" />
                      <span>Tạo danh sách biến thể tự động</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Variants table - hiển thị luôn khi có dữ liệu (kể cả khi variantAttributes rỗng) */}
              {generatedVariants.length > 0 && (
                <div className="space-y-3 pt-3">
                  <span className="font-extrabold text-xs text-slate-800 block">Danh Sách SKU Biến Thể Đã Sinh</span>
                  <p className="text-[10px] text-slate-500 font-medium">Mỗi dòng có ô <strong className="text-emerald-700">Tải ảnh lên</strong> — bấm để chọn ảnh đại diện riêng cho từng SKU.</p>
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                    <table className="min-w-full divide-y divide-slate-250 text-left text-xs font-semibold text-slate-700">
                      <thead className="bg-slate-50 text-[9px] font-bold text-slate-450 uppercase">
                        <tr>
                          <th className="px-3 py-3 w-1/4">Phân Loại SKU</th>
                          <th className="px-3 py-3 w-24 text-center">Ảnh đại diện</th>
                          <th className="px-3 py-3 w-1/3">Mã SKU bán hàng</th>
                          <th className="px-3 py-3">Giá bán (đ)</th>
                          <th className="px-3 py-3">Giá vốn (đ)</th>
                          <th className="px-3 py-3 w-20">Trọng lượng (g)</th>
                          <th className="px-3 py-3 w-16 text-center">Kích Hoạt</th>
                          <th className="px-3 py-3 w-14 text-center">Xóa</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {generatedVariants.map((v) => (
                          <tr key={v.id} className={`hover:bg-slate-50/50 ${!v.active ? "opacity-50 bg-slate-50/30" : ""}`}>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(v.variantAttr).map(([key, val]) => (
                                  <span key={key} className="bg-slate-100 text-slate-655 text-[9px] px-1.5 py-0.5 rounded font-bold">
                                    {val}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-col items-center gap-1.5 min-w-[72px]">
                                <label
                                  className="relative group cursor-pointer block w-14 h-14 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-500 overflow-hidden transition-all"
                                  title="Bấm để tải ảnh đại diện cho biến thể này"
                                >
                                  {v.imageUrl ? (
                                    <>
                                      <img src={v.imageUrl} alt="" className="w-full h-full object-cover" />
                                      <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-0.5 transition-opacity">
                                        <Icon name="photo_camera" className="text-white text-base" />
                                        <span className="text-[8px] font-bold text-white uppercase">Đổi</span>
                                      </span>
                                    </>
                                  ) : (
                                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-emerald-600">
                                      <Icon name="cloud_upload" className="text-xl" />
                                      <span className="text-[8px] font-extrabold uppercase">Tải ảnh</span>
                                    </span>
                                  )}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      handleVariantImageUpload(v.id, e.target.files?.[0]);
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                                <label className="cursor-pointer text-[9px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline">
                                  {v.imageUrl ? "Đổi ảnh" : "Tải ảnh lên"}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      handleVariantImageUpload(v.id, e.target.files?.[0]);
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="text"
                                value={v.sku}
                                onChange={(e) => updateVariantField(v.id, "sku", e.target.value)}
                                className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded px-2 py-1 font-mono text-[10px] text-slate-700 outline-none"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                value={v.price}
                                onChange={(e) => updateVariantField(v.id, "price", Number(e.target.value))}
                                className="w-24 bg-slate-50 focus:bg-white border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded px-2 py-1 font-bold text-slate-800 outline-none"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                value={v.costPrice}
                                onChange={(e) => updateVariantField(v.id, "costPrice", Number(e.target.value))}
                                className="w-24 bg-slate-50 focus:bg-white border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded px-2 py-1 text-slate-700 outline-none"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                value={v.weight}
                                onChange={(e) => updateVariantField(v.id, "weight", Number(e.target.value))}
                                className="w-16 bg-slate-50 focus:bg-white border border-slate-200 focus:ring-1 focus:ring-emerald-500 rounded px-2 py-1 text-slate-700 outline-none"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={v.active !== false}
                                onChange={(e) => updateVariantField(v.id, "active", e.target.checked)}
                                className="w-4 h-4 text-emerald-600 border-slate-350 rounded focus:ring-emerald-500 focus:ring-2 accent-emerald-600 cursor-pointer"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => setGeneratedVariants(prev => prev.filter(item => item.id !== v.id))}
                                className="p-1 hover:bg-rose-50 rounded text-rose-600 hover:text-rose-700 transition-colors"
                                title="Xóa phiên bản này"
                              >
                                <Icon name="delete" className="text-sm" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Right Column: Image and metadata (4/12) */}
        <div className="lg:col-span-4 space-y-6">

          {/* Section 5: Image & Media */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm space-y-4">
            <span className="font-extrabold text-sm text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Icon name="photo_camera" className="text-emerald-600 text-lg" /> Quản Lý Hình Ảnh
            </span>

            {/* Drag & Drop Multi-file Upload Zone */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Tải ảnh lên MinIO (Nhiều ảnh cùng lúc) *</label>
              <label
                htmlFor="image-upload-input"
                className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/20 rounded-xl p-6 cursor-pointer transition-all text-center group"
              >
                <Icon name="cloud_upload" className="text-3xl text-slate-400 group-hover:text-emerald-600 transition-colors" />
                <span className="text-xs font-bold text-slate-700 mt-2">Chọn file ảnh hoặc kéo thả vào đây</span>
                <span className="text-[10px] text-slate-400 mt-1">Chấp nhận định dạng JPG, PNG, WEBP (Có thể chọn nhiều file)</span>
                <input
                  type="file"
                  id="image-upload-input"
                  multiple
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {uploadedImages.length === 0 && (
              <p className="text-[11px] text-amber-600 font-semibold italic">
                Chưa có ảnh nào — vui lòng tải ảnh lên hoặc dán link URL bên dưới.
              </p>
            )}

            {/* URL Paste input */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Hoặc nhập link ảnh trực tiếp (URL)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Dán link ảnh tại đây..."
                  value={tempGalleryUrl}
                  onChange={(e) => setTempGalleryUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddImageUrl();
                    }
                  }}
                  className="flex-1 bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddImageUrl}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                >
                  Thêm link
                </button>
              </div>
            </div>

            {/* Unified Uploaded Images Grid */}
            {uploadedImages.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Hình ảnh đã tải lên ({uploadedImages.length})</label>
                  <span className="text-[10px] text-slate-400 font-bold italic">* Nhấp ngôi sao để chọn làm Ảnh chính</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {uploadedImages.map((img) => (
                    <div
                      key={img.id}
                      className={`relative aspect-square rounded-xl overflow-hidden border p-1 bg-slate-50 transition-all ${img.isMain
                          ? "border-emerald-500 ring-2 ring-emerald-500/20 shadow-md bg-white"
                          : "border-slate-200 hover:border-slate-350"
                        }`}
                    >
                      <img src={img.url} alt="uploaded" className="w-full h-full object-contain rounded-lg" />

                      {/* Main Image Badge/Trigger */}
                      <button
                        type="button"
                        onClick={() => setMainImage(img.id)}
                        className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-all ${img.isMain
                            ? "bg-emerald-600 text-white"
                            : "bg-white/95 hover:bg-white text-slate-400 hover:text-amber-500"
                          }`}
                        title={img.isMain ? "Ảnh chính của sản phẩm" : "Đặt làm ảnh chính"}
                      >
                        <Icon name={img.isMain ? "star" : "star_border"} className="text-base" />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => deleteImage(img.id)}
                        className="absolute top-2 right-2 w-7 h-7 bg-white/95 hover:bg-rose-50 text-rose-600 hover:text-rose-700 rounded-full flex items-center justify-center shadow-md transition-colors"
                        title="Xóa ảnh này"
                      >
                        <Icon name="delete" className="text-sm" />
                      </button>

                      {img.isMain && (
                        <div className="absolute bottom-0 inset-x-0 bg-emerald-600 text-white text-[9px] font-black text-center py-0.5 uppercase tracking-wider">
                          Ảnh chính
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 6: Category & Brand & Status Classification */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm space-y-4">
            <span className="font-extrabold text-sm text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Icon name="grid_view" className="text-emerald-600 text-lg" /> Phân Loại & Trạng Thái
            </span>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Chọn danh mục *</label>
              <select
                required
                value={basicInfo.categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none"
              >
                <option value="">Chọn danh mục sản phẩm</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Chọn thương hiệu *</label>
              <select
                required
                value={basicInfo.brandId}
                onChange={(e) => setBasicInfo(prev => ({ ...prev, brandId: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none"
              >
                <option value="">Chọn thương hiệu</option>
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Trạng thái phát hành *</label>
              <select
                required
                value={basicInfo.status}
                onChange={(e) => setBasicInfo(prev => ({ ...prev, status: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none"
              >
                <option value="DRAFT">Lưu Nháp (DRAFT)</option>
                <option value="PUBLISHED">Công Khai (PUBLISHED)</option>
                <option value="OUT_OF_STOCK">Hết Hàng (OUT_OF_STOCK)</option>
                <option value="ARCHIVED">Lưu Trữ (ARCHIVED)</option>
              </select>
            </div>

            {/* active toggle */}
            <div className="flex items-center pt-2">
              <input
                type="checkbox"
                id="active"
                checked={basicInfo.active}
                onChange={(e) => setBasicInfo(prev => ({ ...prev, active: e.target.checked }))}
                className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="active" className="text-xs font-extrabold text-slate-700 ml-2 cursor-pointer select-none">
                Sản phẩm đang được kích hoạt bán hàng
              </label>
            </div>
          </div>

          {/* Section 7: Tags & Warranty */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm space-y-4">
            <span className="font-extrabold text-sm text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Icon name="verified_user" className="text-emerald-600 text-lg" /> Bảo Hành & Thẻ Tìm Kiếm
            </span>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Thời hạn bảo hành (tháng)</label>
              <input
                type="number"
                value={basicInfo.warrantyPeriod}
                onChange={(e) => setBasicInfo({ ...basicInfo, warrantyPeriod: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Chính sách bảo hành</label>
              <textarea
                rows="2"
                value={basicInfo.warrantyPolicy}
                onChange={(e) => setBasicInfo({ ...basicInfo, warrantyPolicy: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">Thẻ từ khóa (phân cách bằng dấu phẩy)</label>
              <input
                type="text"
                value={basicInfo.tags}
                onChange={(e) => setBasicInfo({ ...basicInfo, tags: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-600 focus:bg-white rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none"
                placeholder="Ví dụ: smartphone, apple, ios"
              />
            </div>
          </div>

        </div>

      </form>
    </div>
  );
}
