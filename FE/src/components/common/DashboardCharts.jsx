import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

// Revenue prediction mock data (Prophet Model)
const revenueData = [
  { day: "T2", real: 32000000, forecast: null },
  { day: "T3", real: 45000000, forecast: null },
  { day: "T4", real: 38000000, forecast: null },
  { day: "T5", real: 52000000, forecast: null },
  { day: "T6 (Hôm nay)", real: 68000000, forecast: 68000000 },
  { day: "T7 (Dự báo)", real: null, forecast: 82000000 },
  { day: "CN (Dự báo)", real: null, forecast: 95000000 }
];

// Category purchase distribution mock data
const categoryData = [
  { name: "Điện thoại", value: 45, color: "#2dd4bf" }, // teal-400
  { name: "Laptop", value: 35, color: "#6366f1" },    // indigo-500
  { name: "Phụ kiện", value: 20, color: "#f59e0b" }    // amber-500
];

const formatCurrency = (value) => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M đ`;
  }
  return `${value.toLocaleString("vi-VN")} đ`;
};

// 1. Revenue prediction chart (Prophet Model)
export function ProphetRevenueChart() {
  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={revenueData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
          <XAxis 
            dataKey="day" 
            stroke="#94a3b8" 
            fontSize={10}
            tickLine={false}
          />
          <YAxis 
            stroke="#94a3b8" 
            fontSize={10}
            tickFormatter={formatCurrency}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #475569",
              borderRadius: "8px",
              color: "#f8fafc",
              fontSize: "12px"
            }}
            formatter={(value) => [value.toLocaleString("vi-VN") + " đ", ""]}
          />
          {/* Real data path */}
          <Area
            name="Doanh thu thực tế"
            type="monotone"
            dataKey="real"
            stroke="#2dd4bf"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorReal)"
            connectNulls
          />
          {/* Forecast data path */}
          <Area
            name="Dự báo (AI)"
            type="monotone"
            dataKey="forecast"
            stroke="#6366f1"
            strokeWidth={2}
            strokeDasharray="5 5"
            fillOpacity={0.5}
            fill="url(#colorForecast)"
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// 2. Category purchase distribution chart
export function CategoryDistributionChart() {
  return (
    <div className="w-full h-64 flex flex-col md:flex-row items-center justify-around">
      <div className="w-40 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={categoryData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={65}
              paddingAngle={4}
              dataKey="value"
            >
              {categoryData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "1px solid #475569",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "11px"
              }}
              formatter={(value) => [`${value}%`, "Tỷ lệ"]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col gap-sm text-xs mt-sm md:mt-0">
        {categoryData.map((item, idx) => (
          <div key={idx} className="flex items-center gap-xs">
            <span 
              className="w-3 h-3 rounded-full shrink-0" 
              style={{ backgroundColor: item.color }}
            ></span>
            <span className="text-slate-300 font-medium">
              {item.name}: <span className="text-white font-bold">{item.value}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
