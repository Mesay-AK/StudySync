const handleTypingIndicators = (socket, io) => {

  socket.on("typing", ({ roomId, userId, isDirect = false, receiverId = null }) => {
    try {
      if (isDirect && receiverId) {
        io.to(receiverId).emit("typing", { userId, isDirect: true });
      } else if (!isDirect && roomId) {
        io.to(roomId).emit("typing", { userId, roomId, isDirect: false });
      } else {
        console.error("Missing parameters for 'typing' event.");
      }
    } catch (error) {
      console.error("Error handling 'typing' event:", error.message);
    }
  });

  /**
   * Handles the 'stopTyping' event for stopping the typing indicator.
   * @param {Object} params - The event parameters.
   * @param {String} params.roomId - The ID of the room (if group chat).
   * @param {String} params.userId - The ID of the user stopping typing.
   * @param {Boolean} [params.isDirect=false] - Flag to check if it's a direct message.
   * @param {String} [params.receiverId=null] - The ID of the receiver (if direct message).
   */
  socket.on("stopTyping", ({ roomId, userId, isDirect = false, receiverId = null }) => {
    try {
      if (isDirect && receiverId) {
        io.to(receiverId).emit("stopTyping", { userId, isDirect: true });
      } else if (!isDirect && roomId) {
        io.to(roomId).emit("stopTyping", { userId, roomId, isDirect: false });
      } else {
        console.error("Missing parameters for 'stopTyping' event.");
      }
    } catch (error) {
      console.error("Error handling 'stopTyping' event:", error.message);
    }
  });
};

export { handleTypingIndicators };
