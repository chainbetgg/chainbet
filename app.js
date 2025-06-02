const firebaseConfig = {
  apiKey: "AIzaSyBhfQ1Wf5JEy6sOU4ExXboRI4Ir4y_aKZw",
  authDomain: "easy-chatroom.firebaseapp.com",
  databaseURL: "https://easy-chatroom-default-rtdb.firebaseio.com",
  projectId: "easy-chatroom",
  storageBucket: "easy-chatroom.firebasestorage.app",
  messagingSenderId: "985049198428",
  appId: "1:985049198428:web:0cad8f285943b9f10c9b99",
  measurementId: "G-Q0YZGZLEMM"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let gameId = new URLSearchParams(window.location.search).get("game");
let userId = null;
let playerIndex = 0;

const hand1 = document.getElementById("hand1");
const hand2 = document.getElementById("hand2");
const bet1 = document.getElementById("bet1");
const bet2 = document.getElementById("bet2");
const status = document.getElementById("status");
const table = document.getElementById("table");
const controls = document.getElementById("controls");
const betBtn = document.getElementById("bet");
const foldBtn = document.getElementById("fold");

const cardBack = "Cards/Cards/cardBack_red5.png";

async function init() {
  const user = await auth.signInAnonymously();
  userId = user.user.uid;

  if (!gameId) {
    const deck = shuffleDeck();
    const hands = [deck.splice(0, 2), deck.splice(0, 2)];
    const board = deck.splice(0, 5); // flop, turn, river

    const doc = await db.collection("games").add({
      createdAt: Date.now(),
      host: userId,
      players: [userId],
      deck,
      hands,
      board,
      bet1: 0,
      bet2: 0,
      pot: 0,
      state: "waiting",
      turn: 0
    });
    gameId = doc.id;
    status.textContent = `Game created! Share this link: ${window.location.href}?game=${gameId}`;
  } else {
    const gameRef = db.collection("games").doc(gameId);
    const doc = await gameRef.get();
    if (!doc.exists) return alert("Invalid game");

    const game = doc.data();
    if (game.players.length < 2 && !game.players.includes(userId)) {
      await gameRef.update({ players: [...game.players, userId], state: "playing" });
    }
    subscribeToGame(gameRef);
  }
}

function shuffleDeck() {
  const suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const deck = [];
  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function getCardFile(card) {
  return `card${card.suit}${card.rank}.png`;
}

function subscribeToGame(gameRef) {
  gameRef.onSnapshot((doc) => {
    const game = doc.data();
    playerIndex = game.players.indexOf(userId);
    if (playerIndex === -1) return;

    status.textContent = game.state === "ended"
      ? `Game Over. Winner: Player ${game.winner + 1}`
      : `Game in progress. Your turn: ${game.turn === playerIndex}`;

    table.classList.remove("hidden");
    controls.classList.remove("hidden");

    const h1 = game.hands[0].map(getCardFile);
    const h2 = game.hands[1].map(getCardFile);
    renderHand(hand1, h1);
    renderHand(hand2, playerIndex === 1 ? h2 : [cardBack, cardBack]);

    bet1.textContent = `Bet: ${game.bet1 || 0}`;
    bet2.textContent = `Bet: ${game.bet2 || 0}`;

    if (game.board) {
      const boardEl = document.getElementById("board") || document.createElement("div");
      boardEl.id = "board";
      boardEl.className = "flex justify-center mt-4 gap-2";
      boardEl.innerHTML = "";
      game.board.forEach(card => {
        const img = document.createElement("img");
        img.src = `Cards/Cards/${getCardFile(card)}`;
        img.className = "w-16";
        boardEl.appendChild(img);
      });
      status.parentElement.insertBefore(boardEl, controls);
    }

    betBtn.disabled = foldBtn.disabled = game.turn !== playerIndex || game.state === "ended";
  });
}

function renderHand(container, cards) {
  container.innerHTML = "";
  cards.forEach((card) => {
    const img = document.createElement("img");
    img.src = `Cards/Cards/${card}`;
    img.className = "w-16";
    container.appendChild(img);
  });
}

function rankValue(rank) {
  const order = {"2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14};
  return order[rank] || 0;
}

function bestHandStrength(hand, board) {
  const allCards = [...hand, ...board];
  const rankCounts = {};
  allCards.forEach(card => {
    rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
  });

  const values = Object.entries(rankCounts)
    .map(([rank, count]) => ({ rank: rankValue(rank), count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  const score = values[0].count * 100 + values[0].rank;
  return score; // e.g., pair of A = 2*100 + 14 = 214
}

betBtn.onclick = async () => {
  const gameRef = db.collection("games").doc(gameId);
  const snap = await gameRef.get();
  const game = snap.data();

  const key = playerIndex === 0 ? "bet1" : "bet2";
  const newBet = (game[key] || 0) + 10;
  const pot = (game.pot || 0) + 10;

  await gameRef.update({
    [key]: newBet,
    pot,
    turn: (playerIndex + 1) % 2
  });

  const otherKey = playerIndex === 0 ? "bet2" : "bet1";
  if (newBet === game[otherKey]) {
    const p0score = bestHandStrength(game.hands[0], game.board);
    const p1score = bestHandStrength(game.hands[1], game.board);
    const winner = p0score === p1score ? 0 : (p0score > p1score ? 0 : 1);
    await gameRef.update({ state: "ended", winner });
  }
};

function serializeCards(cardArray) {
  return cardArray.map(c => ({ suit: c.suit, rank: c.rank }));
}

function deserializeCards(cardArray) {
  return cardArray.map(c => ({ suit: c.suit, rank: c.rank }));
}

// Patch to fix nested array issue when creating the game
async function createGameDocument(db, userId, deck, hand1, hand2, board) {
  const doc = await db.collection("games").add({
    createdAt: Date.now(),
    host: userId,
    players: [userId],
    deck: serializeCards(deck),
    hand1: serializeCards(hand1),
    hand2: serializeCards(hand2),
    board: serializeCards(board),
    bet1: 0,
    bet2: 0,
    pot: 0,
    state: "waiting",
    turn: 0
  });
  return doc.id;
}

// Replace game creation call in init()
async function init() {
  const user = await auth.signInAnonymously();
  userId = user.user.uid;

  if (!gameId) {
    const deck = shuffleDeck();
    const hand1 = deck.splice(0, 2);
    const hand2 = deck.splice(0, 2);
    const board = deck.splice(0, 5);

    gameId = await createGameDocument(db, userId, deck, hand1, hand2, board);
    status.textContent = `Game created! Share this link: ${window.location.href}?game=${gameId}`;
  } else {
    const gameRef = db.collection("games").doc(gameId);
    const doc = await gameRef.get();
    if (!doc.exists) return alert("Invalid game");

    const game = doc.data();
    if (game.players.length < 2 && !game.players.includes(userId)) {
      await gameRef.update({ players: [...game.players, userId], state: "playing" });
    }
    subscribeToGame(gameRef);
  }
}

foldBtn.onclick = async () => {
  alert("Folded! You lose.");
  const gameRef = db.collection("games").doc(gameId);
  await gameRef.update({ state: "ended", winner: (playerIndex + 1) % 2 });
};

init();
