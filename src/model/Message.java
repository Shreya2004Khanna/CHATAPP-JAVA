package model;

public class Message {
    private String fromUser;
    private String toUser; // "ALL" for public
    private String content;

    public Message(String fromUser, String toUser, String content) {
        this.fromUser = fromUser;
        this.toUser = toUser;
        this.content = content;
    }

    public String getFromUser() { return fromUser; }
    public String getToUser() { return toUser; }
    public String getContent() { return content; }
}
