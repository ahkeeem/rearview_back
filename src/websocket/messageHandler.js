const messageHandler = (io) => {
    io.on('connection', (socket) => {
        socket.on('join-conversation', (conversationId) => {
            socket.join(`conversation-${conversationId}`);
        });
        
        socket.on('send-message', async (data) => {
            io.to(`conversation-${data.conversationId}`).emit('new-message', data);
        });

        socket.on('typing', (data) => {
            socket.to(`conversation-${data.conversationId}`).emit('user-typing', data.userId);
        });
    });
};

module.exports = messageHandler;