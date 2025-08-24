import mongoose from 'mongoose';
import ComprehensivePricing from './models/comprehensivePricingModel.js';

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://ahadqureshi16756:ahad123@cluster0.tlo17.mongodb.net/uber?retryWrites=true&w=majority&appName=Cluster0');
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

const updateComprehensivePricing = async () => {
  try {
    console.log('🔄 Updating comprehensive pricing configuration...');
    
    // Find the active comprehensive pricing configuration
    const existingConfig = await ComprehensivePricing.findOne({ isActive: true });
    
    if (!existingConfig) {
      console.log('❌ No active comprehensive pricing configuration found');
      return;
    }
    
    console.log('📋 Current configuration found, updating with new services...');
    
    // Update the configuration with new Shifting & Movers and enhanced Car Recovery
    const updatedConfig = await ComprehensivePricing.findByIdAndUpdate(
      existingConfig._id,
      {
        $set: {
          // Enhanced Car Recovery with service charges and key unlocker
          'serviceTypes.carRecovery': {
            enabled: true,
            flatbed: {
              perKmRate: 3.5, // AED 3.50/km
              serviceCharges: 100 // Fixed service charges
            },
            wheelLift: {
              perKmRate: 3.0, // AED 3.00/km
              serviceCharges: 80 // Fixed service charges
            },
            jumpstart: {
              fixedRate: true,
              minAmount: 50, // AED 50-70 fixed
              maxAmount: 70,
              serviceCharges: 60 // Fixed service charges
            },
            keyUnlocker: {
              serviceCharges: 75 // Fixed service charges
            },
            platformCharges: {
              percentage: 15, // 15% platform charges
              split: '50/50' // 50/50 customer/service provider
            }
          },
          
          // New Shifting & Movers service configuration
          'serviceTypes.shiftingMovers': {
            enabled: true,
            // 1. Vehicle Cost
            vehicleCost: {
              startFare: 100, // Minimum fare AED - covers 5KM
              coverageKm: 5, // Base coverage in KM
              perKmRate: 15 // Per KM fare after 5KM
            },
            // 2. Basic Service Costs (flat fee if selected)
            basicServices: {
              loadingUnloadingHelper: {
                flatFee: 20, // AED 20
                includeInBasicFare: true, // Checkbox
                baseLimit: 3 // Number of items covered in basic charge
              },
              packers: {
                flatFee: 20, // AED 20
                includeInBasicFare: true,
                baseLimit: 3
              },
              fixers: {
                flatFee: 20, // AED 20
                includeInBasicFare: true,
                baseLimit: 3
              }
            },
            // 3. Pickup Location Policy
            pickupLocationPolicy: {
              groundFloor: {
                extraCharge: 0 // No extra charge
              },
              stairs: {
                perFloorFare: {
                  bed: 5, // AED 5 per floor per bed
                  fridge: 15, // AED 15 per floor per fridge
                  sofa: 8,
                  table: 4,
                  chair: 2,
                  wardrobe: 10,
                  washingMachine: 12,
                  tv: 6,
                  microwave: 3,
                  other: 5
                }
              },
              lift: {
                minorCharge: {
                  bed: 5, // AED 5 per item
                  fridge: 7, // AED 7 per item
                  sofa: 6,
                  table: 3,
                  chair: 2,
                  wardrobe: 8,
                  washingMachine: 9,
                  tv: 4,
                  microwave: 2,
                  other: 4
                },
                baseLimit: 1, // Base covers Ground +1 Floor
                baseCoverage: 'Ground +1 Floor'
              }
            },
            // 4. Drop-off Location Policy (Same as Pickup)
            dropoffLocationPolicy: {
              groundFloor: {
                extraCharge: 0
              },
              stairs: {
                perFloorFare: {
                  bed: 5,
                  fridge: 15,
                  sofa: 8,
                  table: 4,
                  chair: 2,
                  wardrobe: 10,
                  washingMachine: 12,
                  tv: 6,
                  microwave: 3,
                  other: 5
                }
              },
              lift: {
                minorCharge: {
                  bed: 5,
                  fridge: 7,
                  sofa: 6,
                  table: 3,
                  chair: 2,
                  wardrobe: 8,
                  washingMachine: 9,
                  tv: 4,
                  microwave: 2,
                  other: 4
                },
                baseLimit: 1,
                baseCoverage: 'Ground +1 Floor'
              }
            },
            // 5. Packing Per Item
            packingFares: {
              bed: 15, // AED 15 per bed
              fridge: 10, // AED 10 per fridge
              sofa: 12,
              table: 8,
              chair: 5,
              wardrobe: 20,
              washingMachine: 15,
              tv: 10,
              microwave: 6,
              other: 8
            },
            // 6. Fixing Per Item
            fixingFares: {
              bed: 20, // AED 20 per bed
              sofa: 15, // AED 15 per sofa
              table: 10,
              chair: 8,
              wardrobe: 25,
              washingMachine: 30,
              tv: 15,
              microwave: 12,
              fridge: 35,
              other: 15
            },
            // 7. Loading/Unloading Per Item
            loadingUnloadingFares: {
              bed: 20, // AED 20 per bed
              sofa: 15, // AED 15 per sofa
              table: 10,
              chair: 5,
              wardrobe: 18,
              washingMachine: 25,
              tv: 12,
              microwave: 8,
              fridge: 30,
              other: 12
            }
          },
          
          // Appointment-based services configuration
          appointmentServices: {
            enabled: true,
            fixedAppointmentFee: 5, // AED 5 per successful appointment
            confirmationSystem: {
              enabled: true,
              surveyTimeoutHours: 24, // 24 hours for survey completion
              autoGpsCheckIn: true, // GPS check-in when provider starts appointment
              ratingThreshold: 3, // Minimum rating for successful appointment
              disputeHandling: {
                enabled: true,
                adminReviewRequired: true
              }
            },
            customerSurvey: {
              questions: [{
                question: 'How was your experience with [Service Provider Name]?',
                options: ['Good', 'Bad', 'Didn\'t Visit']
              }],
              ratingRequired: true,
              feedbackOptional: true
            },
            providerSurvey: {
              questions: [{
                question: 'How was [Customer Name]? Behavior?',
                options: ['Good', 'Bad', 'Didn\'t Meet Yet']
              }],
              ratingRequired: true,
              feedbackOptional: true
            },
            successCriteria: {
              bothConfirmGood: true, // Both confirm "Good"
              oneConfirmsService: true, // At least one confirms service happened
              noShowBoth: false, // Both select "Didn't Visit/Didn't Meet Yet" = no fee
              conflictResolution: 'admin_review' // admin_review, auto_decline, auto_approve
            },
            penaltySystem: {
              enabled: true,
              tooManyNoShows: {
                threshold: 3, // 3 no-shows
                penalty: 'lower_visibility' // lower_visibility, flag_account, suspend
              },
              badRatings: {
                threshold: 2, // Rating below 2
                consecutiveLimit: 3, // 3 consecutive bad ratings
                penalty: 'flag_account'
              }
            }
          }
        }
      },
      { new: true }
    );
    
    console.log('✅ Comprehensive pricing configuration updated successfully!');
    console.log('\n📊 Updated Services:');
    console.log('🚗 Enhanced Car Recovery with service charges and key unlocker');
    console.log('📦 Added Shifting & Movers with complete pricing matrix');
    console.log('📅 Added Appointment Services with 2-way confirmation system');
    
    console.log('\n🔧 Shifting & Movers Features Added:');
    console.log('• Vehicle cost (start fare + per KM)');
    console.log('• Helper/Packer/Fixer flat charges');
    console.log('• Per-item pricing matrix (stairs, lift, packing, fixing)');
    console.log('• Pickup/Dropoff location policies');
    console.log('• Loading/Unloading per-item charges');
    
    console.log('\n🚗 Car Recovery Enhancements:');
    console.log('• Service charges for all recovery types');
    console.log('• Key unlocker service');
    console.log('• Platform charges (15% split 50/50)');
    
    console.log('\n📅 Appointment Services Features:');
    console.log('• Fixed AED 5 fee per successful appointment');
    console.log('• 2-way confirmation system (customer + provider)');
    console.log('• Rating survey within 24 hours');
    console.log('• GPS check-in verification');
    console.log('• Penalty system for no-shows and bad ratings');
    
  } catch (error) {
    console.error('❌ Error updating comprehensive pricing:', error.message);
  }
};

const main = async () => {
  await connectDB();
  await updateComprehensivePricing();
  await mongoose.disconnect();
  console.log('\n🔌 Database connection closed');
};

main().catch(console.error);