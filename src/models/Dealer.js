import mongoose from 'mongoose';

const dealerSchema = new mongoose.Schema({
  // Owning account (the authenticated user who created this dealer record)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'userId is required'],
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Dealer name is required'],
    trim: true,
    maxlength: [100, 'Dealer name cannot exceed 100 characters']
  },
   phone: {
    type: String,
    required: [true, 'Contact number is required'],
    trim: true,
    // Simple validation - accepts any phone format
    match: [/^[\d\s\+\-\(\)]+$/, 'Please enter a valid phone number']
  },
  cnic: {
    type: String,
    required: [true, 'CNIC is required'],
    trim: true,
    // Accept both formats: 12345-1234567-1 or 1234512345671
    match: [/^[\d\-]+$/, 'Please enter a valid CNIC']
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true,
    maxlength: [500, 'Address cannot exceed 500 characters']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    default: ''
  }
}, {
  timestamps: true
});

// Index for search functionality
dealerSchema.index({ name: 'text', phone: 'text', address: 'text', cnic: 'text' });

// CNIC only needs to be unique within a single user's own dealer list,
// not across every account in the database.
dealerSchema.index({ userId: 1, cnic: 1 }, { unique: true });

// Pre-save middleware to trim whitespace
dealerSchema.pre('save', function(next) {
  this.name = this.name.trim();
  this.phone = this.phone.trim();
  this.cnic = this.cnic.trim();
  this.address = this.address.trim();
  if (this.notes) this.notes = this.notes.trim();
//   next();
});

const Dealer = mongoose.model('Dealer', dealerSchema);

export default Dealer;