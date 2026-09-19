package com.codeinterview.repository;

import com.codeinterview.model.InterviewRoom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InterviewRoomRepository extends JpaRepository<InterviewRoom, String> {
    Optional<InterviewRoom> findByRoomCode(String roomCode);
    List<InterviewRoom> findByInterviewerIdOrderByCreatedAtDesc(String interviewerId);
    List<InterviewRoom> findByInterviewerIdAndConfigPackageId(String interviewerId, String configPackageId);
    boolean existsByRoomCode(String roomCode);
}
