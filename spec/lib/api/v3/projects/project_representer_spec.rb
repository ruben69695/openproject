#-- copyright
# OpenProject is a project management system.
# Copyright (C) 2012-2015 the OpenProject Foundation (OPF)
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2013 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See doc/COPYRIGHT.rdoc for more details.
#++

require 'spec_helper'

describe ::API::V3::Projects::ProjectRepresenter do
  let(:project) { FactoryGirl.build(:project) }
  let(:representer) { described_class.new(project) }

  context 'generation' do
    subject(:generated) { representer.to_json }

    it { is_expected.to include_json('Project'.to_json).at_path('_type') }

    describe 'project' do
      it { is_expected.to have_json_path('id') }
      it { is_expected.to have_json_path('identifier') }
      it { is_expected.to have_json_path('name') }
      it { is_expected.to have_json_path('description') }

      it_behaves_like 'has UTC ISO 8601 date and time' do
        let(:date) { project.created_on }
        let(:json_path) { 'createdAt' }
      end

      it_behaves_like 'has UTC ISO 8601 date and time' do
        let(:date) { project.updated_on }
        let(:json_path) { 'updatedAt' }
      end

      it { is_expected.to have_json_path('type') }
    end

    describe '_links' do
      it { is_expected.to have_json_type(Object).at_path('_links') }
      it 'should link to self' do
        expect(subject).to have_json_path('_links/self/href')
      end
      it 'should have a title for link to self' do
        expect(subject).to have_json_path('_links/self/title')
      end

      describe 'create work packages' do
        let(:user) do
          FactoryGirl.build(:user, member_in_project: project, member_through_role: role)
        end
        let(:project) { FactoryGirl.create(:project) }
        let(:representer) { described_class.new(project, current_user: user) }
        context 'user allowed to create work packages' do
          let(:role) { FactoryGirl.create(:role, permissions: [:add_work_packages]) }

          it { is_expected.to have_json_path('_links/createWorkPackage') }
          it { is_expected.to have_json_path('_links/createWorkPackage/href') }

          it { is_expected.to have_json_path('_links/createWorkPackageImmediate') }
          it { is_expected.to have_json_path('_links/createWorkPackageImmediate/href') }
        end

        context 'user not allowed to create work packages' do
          let(:role) { FactoryGirl.create(:role, permissions: []) }

          it { is_expected.to_not have_json_path('_links/createWorkPackage') }
          it { is_expected.to_not have_json_path('_links/createWorkPackage/href') }

          it { is_expected.to_not have_json_path('_links/createWorkPackageImmediate') }
          it { is_expected.to_not have_json_path('_links/createWorkPackageImmediate/href') }
        end
      end

      describe 'categories' do
        it { is_expected.to have_json_path('_links/categories')      }
        it { is_expected.to have_json_path('_links/categories/href') }
      end

      describe 'versions' do
        it { is_expected.to have_json_path('_links/versions')      }
        it { is_expected.to have_json_path('_links/versions/href') }
      end
    end
  end
end
