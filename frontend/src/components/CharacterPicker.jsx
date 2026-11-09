import { CHARACTERS } from "../game/characters";
import "./CharacterPicker.css";

export default function CharacterPicker({
  value,
  onChange,
  disabled = false,
  label = "Choose your chef",
}) {
  return (
    <fieldset className="character-picker" disabled={disabled}>
      <legend>{label}</legend>
      <div className="character-cards">
        {CHARACTERS.map((character) => (
          <button
            type="button"
            key={character.id}
            className={`character-card${value === character.id ? " selected" : ""}`}
            aria-pressed={value === character.id}
            onClick={() => onChange(character.id)}
            style={{ "--character-color": character.color }}
          >
            <img src={character.portrait} alt="" />
            <strong>{character.name}</strong>
            <small>{character.description}</small>
            <span>{value === character.id ? "✓Choosed" : "Choose"}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
