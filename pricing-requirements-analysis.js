import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ComprehensivePricing from './models/comprehensivePricingModel.js';

// Load environment variables
dotenv.config();

async function analyzePricingRequirements() {
    try {
        console.log('📊 PRICING REQUIREMENTS ANALYSIS');
        console.log('=====================================\n');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URL);
        console.log('✅ Connected to MongoDB\n');
        
        // Get the comprehensive pricing configuration
        const pricingConfig = await ComprehensivePricing.findOne({ isActive: true });
        
        if (!pricingConfig) {
            console.log('❌ No active comprehensive pricing configuration found');
            return;
        }
        
        // User Requirements vs Current Configuration
        const requirements = {
            "1. Base Fare (First 6 km): AED 50.00": {
                current: `${pricingConfig.baseFare?.amount || 'N/A'} AED for ${pricingConfig.baseFare?.coverageKm || 'N/A'} km`,
                expected: "50 AED for 6 km",
                status: (pricingConfig.baseFare?.amount === 50 && pricingConfig.baseFare?.coverageKm === 6) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            },
            "2. Per KM Rate (After 6 km): AED 7.50/km": {
                current: `${pricingConfig.perKmRate?.amount || 'N/A'} AED/km`,
                expected: "7.50 AED/km",
                status: (pricingConfig.perKmRate?.amount === 7.5) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            },
            "3. Minimum Fare: AED 50.00": {
                current: `${pricingConfig.minimumFare || 'N/A'} AED`,
                expected: "50 AED",
                status: (pricingConfig.minimumFare === 50) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            },
            "4. Platform Fee: 15% (7.5% driver / 7.5% customer)": {
                current: `${pricingConfig.platformFee?.percentage || 'N/A'}% (Driver: ${pricingConfig.platformFee?.driverShare || 'N/A'}%, Customer: ${pricingConfig.platformFee?.customerShare || 'N/A'}%)`,
                expected: "15% (Driver: 7.5%, Customer: 7.5%)",
                status: (pricingConfig.platformFee?.percentage === 15 && 
                        pricingConfig.platformFee?.driverShare === 7.5 && 
                        pricingConfig.platformFee?.customerShare === 7.5) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            },
            "5. Cancellation Charges": {
                current: `Before arrival: ${pricingConfig.cancellationCharges?.beforeArrival || 'N/A'} AED, After 25%: ${pricingConfig.cancellationCharges?.after25PercentDistance || 'N/A'} AED, After 50%: ${pricingConfig.cancellationCharges?.after50PercentDistance || 'N/A'} AED, After arrival: ${pricingConfig.cancellationCharges?.afterArrival || 'N/A'} AED`,
                expected: "Before arrival: 2 AED, After 25%: 5 AED, After 50%: 5 AED, After arrival: 10 AED",
                status: (pricingConfig.cancellationCharges?.beforeArrival === 2 && 
                        pricingConfig.cancellationCharges?.after25PercentDistance === 5 && 
                        pricingConfig.cancellationCharges?.after50PercentDistance === 5 && 
                        pricingConfig.cancellationCharges?.afterArrival === 10) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            },
            "6. Waiting Charges (After 5 mins): AED 2.00/min, Max: AED 20": {
                current: `After ${pricingConfig.waitingCharges?.freeMinutes || 'N/A'} mins: ${pricingConfig.waitingCharges?.perMinuteRate || 'N/A'} AED/min, Max: ${pricingConfig.waitingCharges?.maximumCharge || 'N/A'} AED`,
                expected: "After 5 mins: 2 AED/min, Max: 20 AED",
                status: (pricingConfig.waitingCharges?.freeMinutes === 5 && 
                        pricingConfig.waitingCharges?.perMinuteRate === 2 && 
                        pricingConfig.waitingCharges?.maximumCharge === 20) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            },
            "7. Night Charges (10 PM–6 AM): +AED 10.00 or 1.25x": {
                current: `${pricingConfig.nightCharges?.startHour || 'N/A'}:00-${pricingConfig.nightCharges?.endHour || 'N/A'}:00: +${pricingConfig.nightCharges?.fixedAmount || 'N/A'} AED or ${pricingConfig.nightCharges?.multiplier || 'N/A'}x`,
                expected: "22:00-06:00: +10 AED or 1.25x",
                status: (pricingConfig.nightCharges?.startHour === 22 && 
                        pricingConfig.nightCharges?.endHour === 6 && 
                        pricingConfig.nightCharges?.fixedAmount === 10 && 
                        pricingConfig.nightCharges?.multiplier === 1.25) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            },
            "8. Surge Pricing: 1.5x – 2.0x (admin control)": {
                current: `Levels: ${pricingConfig.surgePricing?.levels?.map(l => `${l.demandRatio}x demand = ${l.multiplier}x fare`).join(', ') || 'N/A'}`,
                expected: "2x demand = 1.5x fare, 3x demand = 2x fare",
                status: (pricingConfig.surgePricing?.levels?.length === 2 && 
                        pricingConfig.surgePricing?.levels[0]?.demandRatio === 2 && 
                        pricingConfig.surgePricing?.levels[0]?.multiplier === 1.5 && 
                        pricingConfig.surgePricing?.levels[1]?.demandRatio === 3 && 
                        pricingConfig.surgePricing?.levels[1]?.multiplier === 2) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            },
            "9. City-wise Pricing: Adjustable per Emirate (above 10 KM then AED 5/KM)": {
                current: `Enabled: ${pricingConfig.perKmRate?.cityWiseAdjustment?.enabled || false}, Above ${pricingConfig.perKmRate?.cityWiseAdjustment?.aboveKm || 'N/A'} km: ${pricingConfig.perKmRate?.cityWiseAdjustment?.adjustedRate || 'N/A'} AED/km`,
                expected: "Enabled: true, Above 10 km: 5 AED/km",
                status: (pricingConfig.perKmRate?.cityWiseAdjustment?.enabled === true && 
                        pricingConfig.perKmRate?.cityWiseAdjustment?.aboveKm === 10 && 
                        pricingConfig.perKmRate?.cityWiseAdjustment?.adjustedRate === 5) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            },
            "10. Service Types - Car Recovery": {
                current: `Flatbed: ${pricingConfig.serviceTypes?.carRecovery?.flatbed?.perKmRate || 'N/A'} AED/km, Wheel Lift: ${pricingConfig.serviceTypes?.carRecovery?.wheelLift?.perKmRate || 'N/A'} AED/km, Jumpstart: ${pricingConfig.serviceTypes?.carRecovery?.jumpstart?.minAmount || 'N/A'}-${pricingConfig.serviceTypes?.carRecovery?.jumpstart?.maxAmount || 'N/A'} AED (fixed)`,
                expected: "Flatbed: 3.50 AED/km, Wheel Lift: 3.00 AED/km, Jumpstart: 50-70 AED (fixed)",
                status: (pricingConfig.serviceTypes?.carRecovery?.flatbed?.perKmRate === 3.5 && 
                        pricingConfig.serviceTypes?.carRecovery?.wheelLift?.perKmRate === 3 && 
                        pricingConfig.serviceTypes?.carRecovery?.jumpstart?.minAmount === 50 && 
                        pricingConfig.serviceTypes?.carRecovery?.jumpstart?.maxAmount === 70) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            },
            "11. Refreshment Alert: For rides above 20+ km / 30+ min trips": {
                current: `Enabled: ${pricingConfig.roundTrip?.refreshmentAlert?.enabled || false}, Min Distance: ${pricingConfig.roundTrip?.refreshmentAlert?.minimumDistance || 'N/A'} km, Min Duration: ${pricingConfig.roundTrip?.refreshmentAlert?.minimumDuration || 'N/A'} min`,
                expected: "Enabled: true, Min Distance: 20 km, Min Duration: 30 min",
                status: (pricingConfig.roundTrip?.refreshmentAlert?.enabled === true && 
                        pricingConfig.roundTrip?.refreshmentAlert?.minimumDistance === 20 && 
                        pricingConfig.roundTrip?.refreshmentAlert?.minimumDuration === 30) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            },
            "12. Free Stay minutes for round trips: Per km based 1km = 0.5 min, Max minutes": {
                current: `Enabled: ${pricingConfig.roundTrip?.freeStayMinutes?.enabled || false}, Rate: ${pricingConfig.roundTrip?.freeStayMinutes?.ratePerKm || 'N/A'} min/km, Max: ${pricingConfig.roundTrip?.freeStayMinutes?.maximumMinutes || 'N/A'} min`,
                expected: "Enabled: true, Rate: 0.5 min/km, Max: 60 min",
                status: (pricingConfig.roundTrip?.freeStayMinutes?.enabled === true && 
                        pricingConfig.roundTrip?.freeStayMinutes?.ratePerKm === 0.5 && 
                        pricingConfig.roundTrip?.freeStayMinutes?.maximumMinutes === 60) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            },
            "13. VAT: 5% (government charges)": {
                current: `Enabled: ${pricingConfig.vat?.enabled || false}, Percentage: ${pricingConfig.vat?.percentage || 'N/A'}%`,
                expected: "Enabled: true, Percentage: 5%",
                status: (pricingConfig.vat?.enabled === true && pricingConfig.vat?.percentage === 5) ? "✅ CORRECT" : "❌ NEEDS UPDATE"
            }
        };
        
        // Display analysis
        let correctCount = 0;
        let totalCount = Object.keys(requirements).length;
        
        for (const [requirement, analysis] of Object.entries(requirements)) {
            console.log(`\n${requirement}`);
            console.log(`Current: ${analysis.current}`);
            console.log(`Expected: ${analysis.expected}`);
            console.log(`Status: ${analysis.status}`);
            
            if (analysis.status.includes('✅')) {
                correctCount++;
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log(`📊 SUMMARY: ${correctCount}/${totalCount} requirements are correctly configured`);
        console.log(`✅ Correct: ${correctCount}`);
        console.log(`❌ Need Updates: ${totalCount - correctCount}`);
        
        if (correctCount === totalCount) {
            console.log('\n🎉 All pricing requirements are correctly configured!');
        } else {
            console.log('\n⚠️  Some pricing requirements need to be updated.');
        }
        
        // Check for missing configurations
        console.log('\n🔍 ADDITIONAL CHECKS:');
        
        // Check if shifting & movers pricing exists
        console.log('\n14. Shifting & Movers Service:');
        if (pricingConfig.serviceTypes?.shiftingMovers) {
            console.log('✅ Shifting & Movers configuration found');
        } else {
            console.log('❌ Shifting & Movers configuration missing');
        }
        
        // Check item pricing for shifting & movers
        if (pricingConfig.itemPricing && pricingConfig.itemPricing.length > 0) {
            console.log('✅ Item pricing configurations found:', pricingConfig.itemPricing.length, 'items');
        } else {
            console.log('❌ Item pricing configurations missing (needed for shifting & movers)');
        }
        
    } catch (error) {
        console.error('❌ Error during analysis:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

analyzePricingRequirements();