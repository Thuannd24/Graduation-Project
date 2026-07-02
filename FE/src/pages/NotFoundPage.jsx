import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <section className="not-found">
      <h1>Không tìm thấy trang</h1>
      <p>Route này chưa được khai báo trong AuraTech.</p>
      <Link className="primary-cta" to="/">Về trang chủ</Link>
    </section>
  );
}
