import User from "../../models/User.js";

const usersOnline = new Map();

const handleUserConnection = (socket, io) => {

    socket.on("userConnected", async (userId) => {

    const user = await User.findById(userId);
    if (!user || user.isBanned) {
      socket.emit("banned", { message: "You are banned from using the chat." });
      socket.disconnect();
      return;
    }
    if ([...usersOnline.values()].includes(userId)) {
      console.log(`User ${userId} already connected on another tab/device`);
    }

    usersOnline.set(socket.id, userId);
    socket.join(userId); 

    console.log(`User ${userId} connected with socket ${socket.id}`);

    try {
      await User.findByIdAndUpdate(userId, {
        onlineStatus: true,
        lastSeen: new Date(),
      });

      io.emit("updateUserStatus", {
        userId,
        onlineStatus: true,
      });
    } catch (error) {
      console.error("Error updating user online status:", error);
    }
  });

  socket.on("disconnect", async () => {
    const userId = usersOnline.get(socket.id);
    usersOnline.delete(socket.id);

    console.log(`User Disconnected: ${socket.id}`);

    const stillConnected = [...usersOnline.values()].includes(userId);

    if (userId && !stillConnected) {
      const lastSeen = new Date();

      try {
        await User.findByIdAndUpdate(userId, {
          onlineStatus: false,
          lastSeen,
        });

        io.emit("updateUserStatus", {
          userId,
          onlineStatus: false,
          lastSeen,
        });
      } catch (error) {
        console.error("Error updating user offline status:", error);
      }
    }
  });


};

export { handleUserConnection, usersOnline };
