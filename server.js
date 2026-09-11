const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// 1. Configure Express CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const server = http.createServer(app);

// 2. Configure Socket.io CORS
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Memory Store ສຳລັບເກັບອໍເດີ້ຊົ່ວຄາວ (ໃນ Production ໃຫ້ປ່ຽນເປັນ PostgreSQL/Database)
let pendingRides = [];

// REST API ທົດສອບ
app.get('/', (req, res) => {
    res.send('inDrive Backend Real-time Server is running! 🚀');
});

// REST API ສຳລັບສະໝັກສະມາຊິກ (Register)
app.post('/api/auth/register', (req, res) => {
    const { full_name, username, phone, password, role } = req.body;
    const name = full_name || username || 'User';
    console.log('📝 New Register Data:', { name, phone, role });
    
    res.status(200).json({ 
        success: true, 
        message: 'ສະໝັກສະມາຊິກສຳເລັດ!',
        data: { name, phone, role }
    });
});

// REST API ສຳລັບເຂົ້າສູ່ລະບົບ (Login)
app.post('/api/auth/login', (req, res) => {
    const { phone, password } = req.body;
    console.log('🔑 Login Request:', { phone });
    
    // ຕົວຢ່າງ static user payload (ສາມາດເຊື່ອມຕໍ່ DB ກວດສອບໄດ້)
    const userRole = phone.startsWith('0205') ? 'driver' : 'passenger';
    const userName = userRole === 'driver' ? 'ຄົນຂັບ ' + phone.slice(-4) : 'ລູກຄ້າ ' + phone.slice(-4);

    res.status(200).json({ 
        success: true, 
        message: 'ເຂົ້າສູ່ລະບົບສຳເລັດ!',
        token: 'mock-jwt-token-' + Date.now(),
        user: { 
            phone,
            name: userName,
            full_name: userName,
            role: userRole
        }
    });
});

// REST API ສຳລັບຄຳນວນຄ່າໂດຍສານ (Calculate Fare)
app.post('/api/calculate-fare', (req, res) => {
    const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng } = req.body;
    console.log('💰 Calculate Fare Request:', req.body);
    
    if (!pickup_lat || !pickup_lng || !dropoff_lat || !dropoff_lng) {
        return res.status(400).json({ message: 'ຂໍ້ມູນພິກັດບໍ່ຄົບຖ້ວນ' });
    }

    // ຟັງຊັນຄິດໄລ່ໄລຍະທາງ Haversine Formula (km)
    const R = 6371;
    const dLat = (dropoff_lat - pickup_lat) * Math.PI / 180;
    const dLng = (dropoff_lng - pickup_lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(pickup_lat * Math.PI / 180) * Math.cos(dropoff_lat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    const distance_km = parseFloat((R * c).toFixed(2));
    
    // ຄິດໄລ່ລາຄາ: ເລີ່ມຕົ້ນ 15,000 ກີບ + km ລະ 5,000 ກີບ
    const baseFare = 15000;
    const perKmRate = 5000;
    const estimated_price = Math.round(baseFare + (distance_km * perKmRate));

    res.status(200).json({ 
        success: true, 
        distance_km: distance_km,
        estimated_price: estimated_price
    });
});

// REST API ສ້າງອໍເດີ້ຮຽກລົດ (Passenger Booking)
app.post('/api/rides', (req, res) => {
    const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, offered_price } = req.body;

    const newRide = {
        ride_id: Date.now(),
        pickup_lat,
        pickup_lng,
        dropoff_lat,
        dropoff_lng,
        offered_price: offered_price || 15000,
        passenger_name: 'ລູກຄ້າ general',
        status: 'pending',
        created_at: new Date()
    };

    pendingRides.push(newRide);
    
    // ແຈ້ງເຕືອນຫາຄົນຂັບທຸກຄົນຜ່ານ Socket.io
    io.emit('new_ride_requested', newRide);

    res.status(201).json({
        success: true,
        message: 'ສ້າງອໍເດີ້ຮຽກລົດສຳເລັດ',
        ride: newRide
    });
});

// REST API ດຶງລາຍການອໍເດີ້ທີ່ຄ້າງຢູ່ (Pending Rides for Drivers)
app.get('/api/rides/pending', (req, res) => {
    const pendingList = pendingRides.filter(r => r.status === 'pending');
    res.status(200).json(pendingList);
});

// REST API ຄົນຂັບກົດຮັບງານ (Accept Ride)
app.put('/api/rides/:id/accept', (req, res) => {
    const rideId = Number(req.params.id);
    const rideIndex = pendingRides.findIndex(r => r.ride_id === rideId);

    if (rideIndex === -1) {
        return res.status(404).json({ message: 'ບໍ່ພົບອໍເດີ້ ຫຼື ອໍເດີ້ຖືກຮັບໄປແລ້ວ' });
    }

    pendingRides[rideIndex].status = 'accepted';
    const acceptedRide = pendingRides[rideIndex];

    // ລົບອໍເດີ້ອອກຈາກ pending
    pendingRides = pendingRides.filter(r => r.ride_id !== rideId);

    // ແຈ້ງເຕືອນ Real-time ວ່າອໍເດີ້ຖືກຮັບແລ້ວ
    io.emit('ride_accepted', { ride_id: rideId, ride: acceptedRide });

    res.status(200).json({
        success: true,
        message: 'ຮັບງານສຳເລັດ',
        ride: acceptedRide
    });
});

// Socket.io Real-time Event Handling
io.on('connection', (socket) => {
    console.log(`⚡ User connected: ${socket.id}`);

    socket.on('join_passenger_room', (userId) => socket.join('passengers'));
    socket.on('join_driver_room', (driverId) => socket.join('drivers'));

    socket.on('send_ride_request', (rideData) => {
        console.log('📦 New Ride Request:', rideData);
        io.emit('new_ride_requested', rideData);
    });

    socket.on('driver_counter_offer', (offerData) => {
        console.log('🏷️ Driver Counter Offer:', offerData);
        if (offerData.passengerSocketId) {
            io.to(offerData.passengerSocketId).emit('receive_counter_offer', offerData);
        } else {
            io.emit('receive_counter_offer', offerData);
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});