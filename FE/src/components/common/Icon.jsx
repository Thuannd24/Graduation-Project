export default function Icon({ name, filled = false, className = "", style = {} }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ 
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
        ...style 
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
