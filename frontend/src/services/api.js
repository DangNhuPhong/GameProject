import { API_URL } from "./config";

const BASE_URL = `${API_URL}/api`;

export const getRecipes = async () => {
  const response = await fetch(`${BASE_URL}/recipes`);

  if (!response.ok) {
    throw new Error("Failed to fetch recipes");
  }

  const result = await response.json();

  return result.data;
};

export const getRecipeById = async (id) => {
  const response = await fetch(`${BASE_URL}/recipes/${id}`);

  if (!response.ok) {
    throw new Error("Failed to fetch recipe");
  }

  const result = await response.json();

  return result.data;
};

export const createMatch = async (userId, maxPlayers = 4) => {
  const response = await fetch(`${BASE_URL}/matches`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
      max_players: maxPlayers,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Failed to create room");
  }

  return result;
};

export const joinMatch = async (roomCode, userId) => {
  const response = await fetch(`${BASE_URL}/matches/${roomCode}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Failed to join room");
  }

  return result;
};

export const getMatch = async (roomCode) => {
  const response = await fetch(`${BASE_URL}/matches/${roomCode}`);

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Failed to load room");
  }

  return result;
};

export const setReady = async (roomCode, userId, ready) => {
  const response = await fetch(`${BASE_URL}/matches/${roomCode}/ready`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
      ready,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Failed to update ready status");
  }

  return result;
};

export const startMatch = async (roomCode, userId) => {
  const response = await fetch(`${BASE_URL}/matches/${roomCode}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Failed to start match");
  }

  return result;
};
