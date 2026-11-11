import items from "../assets/items-pixel-v2.png";
import dishes from "../assets/dishes-pixel.png";
import "./TutorialCard.css";

// Vector key illustrations stay crisp at every screen size.
export function Keycap({ label }) {
  return (
    <svg className="tg-key" viewBox="0 0 52 56" role="img" aria-label={`${label} key`}>
      <rect x="2" y="6" width="48" height="48" rx="10" fill="#8c9a9c" />
      <rect x="2" y="2" width="48" height="45" rx="10" fill="#f7f4e9" stroke="#c6d2cd" strokeWidth="2" />
      <path d="M10 37h32" stroke="#e0e4d9" strokeWidth="2" />
      <text x="26" y="29" textAnchor="middle" fill="#193b37" fontFamily="system-ui, sans-serif" fontSize={label.length > 1 ? 14 : 21} fontWeight="800">{label}</text>
    </svg>
  );
}

export function MovementKeys({ arrows = false }) {
  const labels = arrows ? ["↑", "←", "↓", "→"] : ["W", "A", "S", "D"];
  return <span className="tg-keyboard" role="group" aria-label={arrows ? "Arrow movement keys" : "WASD movement keys"}>
    {labels.map((label, index) => <span key={label} className={index === 0 ? "tg-keyboard-top" : ""}><Keycap label={label} /></span>)}
  </span>;
}

function Item({ frame, label, burger = false }) {
  const columns = burger ? 2 : 4;
  return <span className="tg-item">
    <span className="tg-item-art" role="img" aria-label={label} style={{
      backgroundImage: `url(${burger ? dishes : items})`,
      backgroundSize: `${columns * 100}% ${burger ? 100 : 300}%`,
      backgroundPosition: `${(frame % columns) * 100 / (columns - 1)}% ${burger ? 0 : Math.floor(frame / columns) * 50}%`,
    }} />
    <span>{label}</span>
  </span>;
}

const visualItems = {
  "hamburger-recipe": [[7, "Bread"], [1, "Cooked meat"], [4, "Chopped tomato"]],
  tomato: [[3, "Fresh tomato"]], chop: [[3, "Fresh tomato"], [4, "Chopped tomato"]],
  meat: [[0, "Raw meat"]], grill: [[0, "Raw meat"], [1, "Cooked meat"]],
  plate: [[9, "Empty plate"]], "add-tomato": [[9, "Plate"], [4, "Chopped tomato"]],
  "add-meat": [[9, "Plate"], [1, "Cooked meat"]],
  bread: [[7, "Bread"], [1, "Hamburger", true]], serve: [[1, "Ready to serve", true]],
};

function RecipeBook() {
  const recipes = [
    { name: "Hamburger", ingredients: [[7, "Bread"], [1, "Cooked meat"], [4, "Chopped tomato"]], instruction: "Grill the meat, chop the tomato, then combine with bread on a plate." },
    { name: "Pizza", ingredients: [[8, "Dough"], [4, "Chopped tomato"]], instruction: "Combine dough and chopped tomato on a plate, then bake in the oven." },
    { name: "Salad", ingredients: [[6, "Chopped salad"]], instruction: "Chop the salad, place it on a plate and serve." },
  ];
  return <section className="tg-recipe-book" aria-label="All recipes">
    <h3>All recipes</h3>
    {recipes.map(({ name, ingredients, instruction }) => <article className="tg-recipe-entry" key={name}>
      <h4>{name}</h4>
      <div className="tg-recipe">{ingredients.map(([frame, label], i) => <span className="tg-recipe-part" key={label}>
        {i > 0 && <span className="tg-connector" aria-hidden="true">+</span>}
        <Item frame={frame} label={label} />
      </span>)}</div>
      <p>{instruction}</p>
    </article>)}
  </section>;
}

export default function TutorialCard({ step, onContinue, onRestart, onExit }) {
  const done = step.done;
  const titleId = done ? "tutorial-complete" : "tutorial-step-title";
  return <section className="tg-card" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby="tutorial-description">
    <header className="tg-header">
      <span className="tg-eyebrow">OVERNAUAN / CHEF ACADEMY</span>
      <span className="tg-counter">{done ? "ALL DONE" : `${String(step.index + 1).padStart(2, "0")} / ${step.total}`}</span>
    </header>
    <div className="tg-progress" role="progressbar" aria-label="Tutorial progress" aria-valuemin={0} aria-valuemax={step.total} aria-valuenow={done ? step.total : step.index}>
      {Array.from({ length: step.total }, (_, i) => <span key={i} className={done || i < step.index ? "is-complete" : i === step.index ? "is-current" : ""} />)}
    </div>
    <div className="tg-visual">
      {!done && step.id === "menu" ? <div className="tg-menu-preview"><Keycap label="E" /><span>View menu</span></div> :
        !done && step.id === "move" ? <div className="tg-movement"><MovementKeys /><span className="tg-or">or</span><MovementKeys arrows /></div> :
        <div className="tg-recipe">{(done ? [[1, "Your first hamburger", true]] : visualItems[step.id] || []).map(([frame, label, burger], i) =>
          <span className="tg-recipe-part" key={label}>{i > 0 && <span className="tg-connector" aria-hidden="true">{["chop", "grill", "bread"].includes(step.id) ? "→" : "+"}</span>}<Item frame={frame} label={label} burger={burger} /></span>)}
        </div>}
      <span className="tg-visual-caption">{done ? "FIRST ORDER SERVED" : step.id === "move" ? "YOUR KITCHEN. YOUR FIRST STEPS." : "LEARN BY DOING"}</span>
    </div>
    <div className="tg-copy" aria-live="polite" aria-atomic="true">
      <h2 id={titleId}>{done ? "You're ready, chef!" : step.title}</h2>
      <p id="tutorial-description">{done ? "You can move, read orders, chop, grill, assemble and serve a hamburger. Take your new skills into your next kitchen!" : step.text}</p>
      {!done && <aside className="tg-tip"><span aria-hidden="true">✦</span>{step.tip}</aside>}
    </div>
    {done && <RecipeBook />}
    {!done && <div className="tg-controls-strip">{step.id === "move" ? <span>Touch controls? Drag the joystick to move.</span> : <><Keycap label="E" /><span>Interact</span><Keycap label="Q" /><span>Drop item</span></>}</div>}
    <footer className="tg-footer">
      <p className="tg-note">{done ? "Your Story progress is unchanged." : "Practice at your pace · No time limit"}</p>
      <div className="tg-actions">
        <button className="tg-secondary" onClick={onRestart}>Restart{done ? " tutorial" : ""}</button>
        <button className={done ? "tg-primary" : "tg-secondary"} onClick={onExit}>{done ? "Back to modes" : "Exit tutorial"}</button>
        {!done && <button className="tg-primary" onClick={onContinue}><Keycap label="E" />Let's try it<span aria-hidden="true">→</span></button>}
      </div>
    </footer>
  </section>;
}
