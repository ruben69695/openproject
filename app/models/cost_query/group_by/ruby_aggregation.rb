module CostQuery::GroupBy
  module RubyAggregation
    def responsible_for_sql?
      false
    end

    ##
    # @return [CostQuery::Result] aggregation
    def result
      child.result.grouped_by all_group_fields(false)
    end
  end
end