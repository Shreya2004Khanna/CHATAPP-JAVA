package client;

import java.io.*;
import java.net.*;
import java.util.Scanner;

/**
 * Simple console client that works with the Server protocol.
 * - sends username as first line
 * - supports /users, /exit, @username msg, /pm username msg
 * - parses server structured messages (SYSTEM, USERS, PUBLIC, PRIVATE)
 */
public class Client {
    private static final String HOST = "localhost";
    private static final int PORT = 5000;

    public static void main(String[] args) {
        System.out.println("Chat Client starting...");
        try (Socket socket = new Socket(HOST, PORT)) {
            System.out.println("Connected to server " + HOST + ":" + PORT);

            BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), "UTF-8"));
            PrintWriter out = new PrintWriter(new OutputStreamWriter(socket.getOutputStream(), "UTF-8"), true);

            Scanner scanner = new Scanner(System.in, "UTF-8");

            // Read initial server prompt (if any) in background until it requests username
            // But common pattern: server tells to send username first. We'll read any initial lines until prompt printed.
            String serverLine = in.readLine();
            if (serverLine != null && serverLine.startsWith("SYSTEM|")) {
                System.out.println(serverLine.substring("SYSTEM|".length()));
            } else if (serverLine != null) {
                System.out.println(serverLine);
            }

            // Ask user for username and send it
            System.out.print("Enter your username: ");
            final String username = scanner.nextLine().trim();
            while (username.isEmpty()) {
                System.out.print("Username cannot be empty. Enter your username: ");
            }
            out.println(username);


            // Start thread to read server messages
            Thread reader = new Thread(() -> {
                try {
                    String line;
                    while ((line = in.readLine()) != null) {
                        // Parse structured server messages
                        if (line.startsWith("SYSTEM|")) {
                            System.out.println("[SYSTEM] " + line.substring("SYSTEM|".length()));
                        } else if (line.startsWith("USERS|")) {
                            String list = line.substring("USERS|".length());
                            System.out.println("[USERS] " + (list.isEmpty() ? "(no users)" : list));
                        } else if (line.startsWith("PUBLIC|")) {
                            // PUBLIC|from|message
                            String[] parts = line.split("\\|", 3);
                            if (parts.length == 3) {
                                System.out.println("[" + parts[1] + "] " + parts[2]);
                            } else {
                                System.out.println(line);
                            }
                        } else if (line.startsWith("PRIVATE|")) {
                            // PRIVATE|from|to|message
                            String[] parts = line.split("\\|", 4);
                            if (parts.length == 4) {
                                String from = parts[1], to = parts[2], msg = parts[3];
                                if (to.equals(username)) {
                                    System.out.println("[Private from " + from + "] " + msg);
                                } else if (from.equals(username)) {
                                    System.out.println("[Private to " + to + "] " + msg);
                                } else {
                                    // unexpected but show it
                                    System.out.println("[Private] " + from + " -> " + to + ": " + msg);
                                }
                            } else {
                                System.out.println(line);
                            }
                        } else {
                            // fallback raw
                            System.out.println(line);
                        }
                    }
                    System.out.println("Server closed connection.");
                } catch (IOException e) {
                    System.out.println("Connection lost.");
                }
            });
            reader.setDaemon(true);
            reader.start();

            // Main loop: read console input and send
            System.out.println("You can now type messages. Commands: /users  /exit  /pm username message  or @username message");
            while (true) {
                String input = scanner.nextLine();
                if (input == null) break;
                input = input.trim();
                if (input.isEmpty()) continue;

                // local handling: /exit -> send and break
                if (input.equalsIgnoreCase("/exit")) {
                    out.println("/exit");
                    break;
                }

                // send as-is to server. Server parses private/public etc.
                out.println(input);
            }

            System.out.println("Disconnected. Bye!");
        } catch (IOException e) {
            System.err.println("Unable to connect: " + e.getMessage());
        }
    }
}
