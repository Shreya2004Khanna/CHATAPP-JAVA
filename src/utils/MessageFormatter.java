package utils;

import model.Message;

public class MessageFormatter {

    public static String formatForBroadcast(Message msg) {
        return "[" + msg.getFromUser() + "]: " + msg.getContent();
    }

    public static String formatForPrivate(Message msg) {
        return "(Private) [" + msg.getFromUser() + " → " + msg.getToUser() + "]: " + msg.getContent();
    }
}
