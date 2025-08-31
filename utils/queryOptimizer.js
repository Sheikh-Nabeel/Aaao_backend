// Query optimization utilities for MongoDB performance monitoring
import mongoose from 'mongoose';

/**
 * Query Optimizer utility class for MongoDB performance monitoring
 * and optimization recommendations
 */
class QueryOptimizer {
  constructor() {
    this.slowQueryThreshold = 100; // milliseconds
    this.queryStats = new Map();
  }

  /**
   * Monitor query performance and log slow queries
   * @param {string} operation - The operation name
   * @param {Function} queryFunction - The query function to execute
   * @param {Object} context - Additional context for logging
   */
  async monitorQuery(operation, queryFunction, context = {}) {
    const startTime = Date.now();
    
    try {
      const result = await queryFunction();
      const executionTime = Date.now() - startTime;
      
      // Log slow queries
      if (executionTime > this.slowQueryThreshold) {
        console.warn(`🐌 Slow Query Detected: ${operation}`.yellow);
        console.warn(`⏱️  Execution Time: ${executionTime}ms`.yellow);
        console.warn(`📊 Context:`, context);
        
        // Store query stats
        this.updateQueryStats(operation, executionTime);
      }
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ Query Failed: ${operation}`.red);
      console.error(`⏱️  Execution Time: ${executionTime}ms`.red);
      console.error(`📊 Context:`, context);
      throw error;
    }
  }

  /**
   * Update query statistics
   * @param {string} operation - The operation name
   * @param {number} executionTime - Query execution time
   */
  updateQueryStats(operation, executionTime) {
    if (!this.queryStats.has(operation)) {
      this.queryStats.set(operation, {
        count: 0,
        totalTime: 0,
        maxTime: 0,
        minTime: Infinity
      });
    }
    
    const stats = this.queryStats.get(operation);
    stats.count++;
    stats.totalTime += executionTime;
    stats.maxTime = Math.max(stats.maxTime, executionTime);
    stats.minTime = Math.min(stats.minTime, executionTime);
  }

  /**
   * Get query performance statistics
   */
  getQueryStats() {
    const stats = {};
    
    for (const [operation, data] of this.queryStats) {
      stats[operation] = {
        ...data,
        avgTime: Math.round(data.totalTime / data.count)
      };
    }
    
    return stats;
  }

  /**
   * Optimize geospatial queries with proper indexing hints
   * @param {Object} model - Mongoose model
   * @param {Object} geoQuery - Geospatial query object
   * @param {Object} options - Additional query options
   */
  async optimizeGeoQuery(model, geoQuery, options = {}) {
    return this.monitorQuery(
      `GeoQuery_${model.modelName}`,
      () => {
        return model.find(geoQuery)
          .hint({ currentLocation: '2dsphere' }) // Use geospatial index
          .limit(options.limit || 50)
          .select(options.select || '')
          .lean(options.lean !== false); // Default to lean queries
      },
      { model: model.modelName, query: geoQuery }
    );
  }

  /**
   * Optimize aggregation pipelines
   * @param {Object} model - Mongoose model
   * @param {Array} pipeline - Aggregation pipeline
   * @param {Object} options - Additional options
   */
  async optimizeAggregation(model, pipeline, options = {}) {
    return this.monitorQuery(
      `Aggregation_${model.modelName}`,
      () => {
        return model.aggregate(pipeline)
          .allowDiskUse(options.allowDiskUse || false)
          .option({ maxTimeMS: options.maxTimeMS || 30000 });
      },
      { model: model.modelName, pipelineStages: pipeline.length }
    );
  }

  /**
   * Create optimized find query with proper indexing
   * @param {Object} model - Mongoose model
   * @param {Object} filter - Query filter
   * @param {Object} options - Query options
   */
  async optimizeFind(model, filter, options = {}) {
    return this.monitorQuery(
      `Find_${model.modelName}`,
      () => {
        let query = model.find(filter);
        
        // Apply optimizations
        if (options.hint) query = query.hint(options.hint);
        if (options.limit) query = query.limit(options.limit);
        if (options.sort) query = query.sort(options.sort);
        if (options.select) query = query.select(options.select);
        if (options.populate) query = query.populate(options.populate);
        
        // Use lean queries for better performance when possible
        if (options.lean !== false) query = query.lean();
        
        return query;
      },
      { model: model.modelName, filter }
    );
  }

  /**
   * Monitor connection pool status
   */
  getConnectionPoolStatus() {
    const connection = mongoose.connection;
    
    if (connection.readyState === 1) {
      return {
        status: 'connected',
        host: connection.host,
        port: connection.port,
        name: connection.name,
        readyState: connection.readyState,
        // Note: Connection pool metrics may vary by MongoDB driver version
        poolSize: connection.db?.serverConfig?.poolSize || 'N/A'
      };
    }
    
    return {
      status: 'disconnected',
      readyState: connection.readyState
    };
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport() {
    const stats = this.getQueryStats();
    const connectionStatus = this.getConnectionPoolStatus();
    
    console.log('\n📊 Database Performance Report'.cyan.bold);
    console.log('================================'.cyan);
    
    // Connection status
    console.log('\n🔗 Connection Status:'.green);
    console.log(JSON.stringify(connectionStatus, null, 2));
    
    // Query statistics
    if (Object.keys(stats).length > 0) {
      console.log('\n⚡ Query Performance:'.green);
      for (const [operation, data] of Object.entries(stats)) {
        console.log(`\n${operation}:`);
        console.log(`  Count: ${data.count}`);
        console.log(`  Avg Time: ${data.avgTime}ms`);
        console.log(`  Max Time: ${data.maxTime}ms`);
        console.log(`  Min Time: ${data.minTime}ms`);
        
        if (data.avgTime > this.slowQueryThreshold) {
          console.log(`  ⚠️  Performance Warning: Average time exceeds threshold`.yellow);
        }
      }
    } else {
      console.log('\n📈 No query statistics available yet'.yellow);
    }
    
    console.log('\n================================'.cyan);
  }

  /**
   * Set slow query threshold
   * @param {number} threshold - Threshold in milliseconds
   */
  setSlowQueryThreshold(threshold) {
    this.slowQueryThreshold = threshold;
    console.log(`🎯 Slow query threshold set to ${threshold}ms`.cyan);
  }

  /**
   * Clear query statistics
   */
  clearStats() {
    this.queryStats.clear();
    console.log('📊 Query statistics cleared'.cyan);
  }
}

// Create singleton instance
const queryOptimizer = new QueryOptimizer();

// Export both the class and singleton instance
export { QueryOptimizer, queryOptimizer };
export default queryOptimizer;