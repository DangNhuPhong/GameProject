import { CHARACTERS } from "../game/characters";
import "./CharacterPicker.css";
import { FREE_CHARACTER_IDS } from "../game/characterAccess";

export default function CharacterPicker({
  value,
  onChange,
  disabled = false,
  label = "Choose your chef",
  ownedIds = FREE_CHARACTER_IDS,
}) {
  return (
    <fieldset className="character-picker" disabled={disabled}>
      <legend>{label}</legend>
      <div className="character-cards">
        {CHARACTERS.map((character) => (
          <button
            type="button"
            key={character.id}
            disabled={!ownedIds.includes(character.id)}
            title={ownedIds.includes(character.id) ? character.name : "Buy this character in the Shop to unlock"}
            className={`character-card${value === character.id ? " selected" : ""}`}
            aria-pressed={value === character.id}
            onClick={() => { if (ownedIds.includes(character.id)) onChange(character.id); }}
            style={{ "--character-color": character.color }}
          >
            <img src={character.portrait} alt="" />
            <strong>{character.name}</strong>
            {!ownedIds.includes(character.id) && <small className="character-locked">Locked · Buy in Shop</small>}
            <small>{character.description}</small>
            <span>{value === character.id ? "✓Choosed" : "Choose"}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
