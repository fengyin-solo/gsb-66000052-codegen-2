package com.codeinterview.dto;

import com.codeinterview.model.InterviewRoom;
import com.codeinterview.model.ParticipantStatus;

public class CreateRoomResponse {
    private InterviewRoom room;
    private ParticipantStatus participant;
    private boolean duplicated;

    public CreateRoomResponse() {
    }

    public CreateRoomResponse(InterviewRoom room, ParticipantStatus participant) {
        this(room, participant, false);
    }

    public CreateRoomResponse(InterviewRoom room, ParticipantStatus participant, boolean duplicated) {
        this.room = room;
        this.participant = participant;
        this.duplicated = duplicated;
    }

    public InterviewRoom getRoom() {
        return room;
    }

    public void setRoom(InterviewRoom room) {
        this.room = room;
    }

    public ParticipantStatus getParticipant() {
        return participant;
    }

    public void setParticipant(ParticipantStatus participant) {
        this.participant = participant;
    }

    public boolean isDuplicated() {
        return duplicated;
    }

    public void setDuplicated(boolean duplicated) {
        this.duplicated = duplicated;
    }
}
