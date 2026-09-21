package server;

import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.*;

/**
 * Temporary room-based chat server.
 *
 * Client sends first message in this format:
 *  JOIN|roomCode|username
 *
 * Then they can send:
 *  - plain text -> public message in the room
 *  - @username message or /pm username message -> private message in the room
 *  - /users -> list members in the room
 *  - /exit -> leave the room and disconnect
 */
public class Server {

    private static final int PORT = 5000;
    private static final ConcurrentHashMap<String, Room> rooms = new ConcurrentHashMap<>();
    private static final ExecutorService pool = Executors.newCachedThreadPool();

    public static void main(String[] args) {
        System.out.println("Server starting on port " + PORT + " ...");
        try (ServerSocket serverSocket = new ServerSocket(PORT)) {
            System.out.println("Server started. Waiting for clients...");
            while (true) {
                Socket socket = serverSocket.accept();
                pool.submit(new ClientHandler(socket));
            }
        } catch (IOException e) {
            e.printStackTrace();
        } finally {
            shutdown();
        }
    }

    static void shutdown() {
        try {
            pool.shutdownNow();
        } catch (Exception ignored) {}
        System.out.println("Server shutting down.");
    }

    static void broadcastSystemToRoom(String roomCode, String message) {
        Room room = rooms.get(roomCode);
        if (room != null) {
            room.broadcast("SYSTEM|" + message);
        }
    }

    static void broadcastUserListToRoom(String roomCode) {
        Room room = rooms.get(roomCode);
        if (room != null) {
            room.broadcast("USERS|" + room.userList());
        }
    }

    static void broadcastPublicToRoom(String roomCode, String from, String message) {
        Room room = rooms.get(roomCode);
        if (room != null) {
            room.broadcast("PUBLIC|" + from + "|" + message);
        }
    }

    static boolean sendPrivateToRoom(String roomCode, String from, String to, String message) {
        Room room = rooms.get(roomCode);
        if (room == null) return false;

        ClientHandler target = room.getMemberIgnoreCase(to);
        if (target != null) {
            String payload = "PRIVATE|" + from + "|" + target.username + "|" + message;
            target.sendRaw(payload);

            ClientHandler sender = room.getMember(from);
            if (sender != null && !from.equals(to)) {
                sender.sendRaw(payload);
            }
            return true;
        }

        ClientHandler sender = room.getMember(from);
        if (sender != null) {
            sender.sendRaw("SYSTEM|User '" + to + "' not found in this room.");
        }
        return false;
    }

    static class Room {
        private final String roomCode;
        private final Set<ClientHandler> members = ConcurrentHashMap.newKeySet();

        Room(String roomCode) {
            this.roomCode = roomCode;
        }

        void addMember(ClientHandler client) {
            members.add(client);
        }

        void removeMember(ClientHandler client) {
            members.remove(client);
            if (members.isEmpty()) {
                rooms.remove(roomCode);
            }
        }

        ClientHandler getMember(String username) {
            for (ClientHandler member : members) {
                if (username.equals(member.username)) return member;
            }
            return null;
        }

        ClientHandler getMemberIgnoreCase(String username) {
            for (ClientHandler member : members) {
                if (username.equalsIgnoreCase(member.username)) return member;
            }
            return null;
        }

        String userList() {
            return members.stream()
                .map(member -> member.username)
                .filter(Objects::nonNull)
                .sorted()
                .collect(Collectors.joining(","));
        }

        void broadcast(String payload) {
            for (ClientHandler member : members) {
                member.sendRaw(payload);
            }
        }
    }

    static class ClientHandler implements Runnable {
        private final Socket socket;
        private String username;
        private String roomCode;
        private BufferedReader in;
        private PrintWriter out;
        private volatile boolean running = true;

        ClientHandler(Socket socket) {
            this.socket = socket;
        }

        @Override
        public void run() {
            try {
                in = new BufferedReader(new InputStreamReader(socket.getInputStream(), "UTF-8"));
                out = new PrintWriter(new OutputStreamWriter(socket.getOutputStream(), "UTF-8"), true);

                String firstLine = in.readLine();
                if (firstLine == null || firstLine.trim().isEmpty()) {
                    out.println("SYSTEM|Invalid join request. Connection closing.");
                    closeConnection();
                    return;
                }

                String[] joinParts = firstLine.trim().split("\\|", 3);
                if (joinParts.length != 3 || !"JOIN".equalsIgnoreCase(joinParts[0])) {
                    out.println("SYSTEM|Invalid join format. Connection closing.");
                    closeConnection();
                    return;
                }

                roomCode = joinParts[1].trim();
                username = joinParts[2].trim();

                if (roomCode.isEmpty() || username.isEmpty()) {
                    out.println("SYSTEM|Room code and username are required. Connection closing.");
                    closeConnection();
                    return;
                }

                Room room = rooms.computeIfAbsent(roomCode, Room::new);
                if (room.getMember(username) != null) {
                    out.println("SYSTEM|Username already taken in this room. Connection closing.");
                    closeConnection();
                    return;
                }

                room.addMember(this);
                System.out.println("User joined: " + username + " in room " + roomCode + " from " + socket.getRemoteSocketAddress());
                broadcastSystemToRoom(roomCode, username + " joined the room.");
                broadcastUserListToRoom(roomCode);

                String line;
                while (running && (line = in.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty()) continue;

                    if (line.equalsIgnoreCase("/exit")) {
                        out.println("SYSTEM|Goodbye!");
                        break;
                    }

                    if (line.equalsIgnoreCase("/users")) {
                        out.println("USERS|" + room.userList());
                        continue;
                    }

                    if (line.startsWith("@")) {
                        int space = line.indexOf(' ');
                        if (space > 1) {
                            String target = line.substring(1, space).trim();
                            String msg = line.substring(space + 1).trim();
                            sendPrivateToRoom(roomCode, username, target, msg);
                            continue;
                        } else {
                            out.println("SYSTEM|Invalid private message format. Use: @username message");
                            continue;
                        }
                    }

                    if (line.startsWith("/pm ") || line.startsWith("/msg ")) {
                        String[] parts = line.split("\\s+", 3);
                        if (parts.length >= 3) {
                            String target = parts[1].trim();
                            String msg = parts[2].trim();
                            sendPrivateToRoom(roomCode, username, target, msg);
                        } else {
                            out.println("SYSTEM|Invalid command. Use: /pm username message");
                        }
                        continue;
                    }

                    broadcastPublicToRoom(roomCode, username, line);
                }

            } catch (IOException e) {
                System.out.println("Connection error for user " + username + ": " + e.getMessage());
            } finally {
                closeConnection();
            }
        }

        void sendRaw(String message) {
            try {
                out.println(message);
            } catch (Exception ignored) {}
        }

        void closeConnection() {
            if (!running) return;
            running = false;
            try {
                if (roomCode != null && username != null) {
                    Room room = rooms.get(roomCode);
                    if (room != null) {
                        room.removeMember(this);
                        System.out.println("User left: " + username + " from room " + roomCode);
                        broadcastSystemToRoom(roomCode, username + " left the room.");
                        broadcastUserListToRoom(roomCode);
                    }
                }
                if (socket != null && !socket.isClosed()) socket.close();
            } catch (IOException ignored) {}
        }
    }
}
