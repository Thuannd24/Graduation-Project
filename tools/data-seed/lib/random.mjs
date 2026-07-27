// PRNG có seed (mulberry32) + các hàm lấy mẫu phân phối thống kê dùng để sinh dữ liệu tổng hợp.
// Seed cố định (truyền qua --seed, mặc định 42) để dataset sinh ra REPRODUCIBLE giữa các lần
// chạy — quan trọng khi cần debug hoặc so sánh kết quả train model trước/sau thay đổi feature.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 42) {
    this._next = mulberry32(seed);
  }

  /** Uniform [0, 1) */
  next() {
    return this._next();
  }

  /** Uniform integer [min, max] (2 đầu đều bao gồm) */
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Uniform float [min, max) */
  float(min, max) {
    return this.next() * (max - min) + min;
  }

  /** true với xác suất p */
  bool(p) {
    return this.next() < p;
  }

  /** Chọn ngẫu nhiên 1 phần tử */
  choice(arr) {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Chọn n phần tử không lặp lại (n <= arr.length) */
  pickN(arr, n) {
    const pool = [...arr];
    const result = [];
    for (let i = 0; i < n && pool.length > 0; i++) {
      const idx = this.int(0, pool.length - 1);
      result.push(pool.splice(idx, 1)[0]);
    }
    return result;
  }

  /** Chọn theo trọng số (weights cùng độ dài với items, không cần chuẩn hoá tổng = 1) */
  weightedChoice(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Standard normal qua Box-Muller */
  normal(mean = 0, stddev = 1) {
    const u1 = Math.max(this.next(), 1e-12); // tránh log(0)
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stddev;
  }

  /** Log-normal: exp(normal(mu, sigma)) — dùng cho giá trị đơn hàng (lệch phải, luôn dương) */
  lognormal(mu, sigma) {
    return Math.exp(this.normal(mu, sigma));
  }

  /** Pareto (Lomax dịch chuyển): dùng cho monetary lệch nặng (số ít user chi rất nhiều) */
  pareto(xm, alpha) {
    const u = Math.max(this.next(), 1e-12);
    return xm / Math.pow(u, 1 / alpha);
  }

  /** Số nguyên Poisson(lambda) — dùng cho số đơn hàng/số sự kiện trong 1 khoảng thời gian.
   * Thuật toán Knuth, đủ nhanh cho lambda vừa phải (< ~30, phù hợp quy mô đồ án). */
  poisson(lambda) {
    if (lambda <= 0) return 0;
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }
}
