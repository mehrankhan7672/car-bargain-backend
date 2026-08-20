// src/config/database.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Car from '../models/Car.js';

dotenv.config();

const connectDB = async () => {
  try {
    // Remove the options object - they're no longer needed in Mongoose 6+
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);

    // FIX: Mongoose's autoIndex only ADDS indexes that are missing — it
    // never drops an index that used to be in the schema but isn't anymore
    // (e.g. the old field-level `unique: true, sparse: true` on
    // registrationNumber, before it was replaced with a partial unique
    // index). That stale index stays live in MongoDB forever unless
    // something explicitly reconciles it. syncIndexes() does exactly that
    // — it compares the live indexes in the DB against what's currently
    // defined in Car.js and drops/creates whatever is out of sync. Running
    // it here means this fixes itself on every server restart, with no
    // separate migration script to remember to run.
    try {
      const syncResult = await Car.syncIndexes();
      console.log('✅ Car indexes synced:', syncResult);
    } catch (indexError) {
      console.error('⚠️ Failed to sync Car indexes:', indexError.message);
    }

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('⚠️ MongoDB connection closed due to app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

export default connectDB;