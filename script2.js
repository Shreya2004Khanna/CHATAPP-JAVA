function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function showGeneratedCode(code) {
  const roomCodeBox = document.getElementById("roomCodeBox");
  const generatedRoomCode = document.getElementById("generatedRoomCode");
  if (roomCodeBox && generatedRoomCode) {
    generatedRoomCode.textContent = code;
    roomCodeBox.style.display = "block";
  }
}

function loginUser(createRoom) {
  let username = document.getElementById("username").value.trim();
  let roomCode = document.getElementById("roomCode").value.trim();

  if (username === "") {
    alert("Enter a valid name!");
    return;
  }

  if (createRoom) {
    roomCode = generateRoomCode();
    showGeneratedCode(roomCode);
    sessionStorage.setItem("generatedRoomCode", roomCode);
    sessionStorage.setItem("lastCreatedRoomCode", roomCode);
  } else {
    if (roomCode === "") {
      alert("Enter the room code to join.");
      return;
    }
    sessionStorage.removeItem("generatedRoomCode");
    sessionStorage.removeItem("lastCreatedRoomCode");
  }

  sessionStorage.setItem("username", username);
  sessionStorage.setItem("roomCode", roomCode);

  if (!createRoom) {
    window.location.href = "index.html";
  }
}
