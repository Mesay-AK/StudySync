import DirectMessage from "../models/DirectMessage.js";
// import User from "../models/User.js";   


export const getDirectMessages = async (req, res) => {
  const { sender, receiver } = req.params;

  try {
    const messages = await DirectMessage.find({
      $or: [
        { sender, receiver },
        { sender: receiver, receiver: sender },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

export const searchMessages = async (req, res) => {
  const { sender, receiver } = req.params;
  const { searchTerm } = req.query;

  if (!searchTerm) return res.status(400).json({ error: "Missing searchTerm" });

  try {
    const messages = await DirectMessage.find({
      $and: [
        {
          $or: [
            { sender, receiver },
            { sender: receiver, receiver: sender },
          ],
        },
        { content: { $regex: searchTerm, $options: "i" } },
      ],
    });

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: "Search failed" });
  }
};
